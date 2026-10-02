   import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
   import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";
   import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
    import { getDatabase, ref, set, get, update, remove, child, push, query, orderByChild, equalTo, onValue, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

	// Lấy cấu hình từ file HTML (thông qua biến toàn cục window)
	const firebaseConfig = window.firebaseConfig;

// Kiểm tra xem config có tồn tại không để tránh lỗi. Kiểm tra sớm (Guard Clause)
if (!firebaseConfig) {
    alert("Lỗi: Không tìm thấy cấu hình Firebase tại file html!");
    throw new Error("Firebase config is missing!"); // Dừng thực thi các lệnh phía dưới
}
    // Vì đã check và throw error ở trên, nên nếu chạy xuống được đây chắc chắn firebaseConfig đã hợp lệ.
	const app = initializeApp(firebaseConfig);
	const auth = getAuth(app);
    const db = getDatabase(app);

    const statusDiv = document.getElementById('status');
    let selectedTasks = new Set();
    let selectedJustifications = new Set();
    let executionGroups = new Map();
    let docDataMap = new Map();
	let parentNoiDungMap = new Map();
   
    let editModeStatusByYear = {};
	let lockedYears = {};
    let currentYear = new Date().getFullYear();
    let planningModeByYear = {};
    let isAuthenticated = false;
    let activeExportType = 'simplified';
    let activeCharts = [];
// URL của Google Apps Script Web App
const WEB_APP_URL = window.WEB_APP_URL;
const RECAPTCHA_SITE_KEY = window.RECAPTCHA_SITE_KEY;

// Hàm hỗ trợ đọc file dưới dạng chuỗi Base64 trả về Promise
const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(',')[1]);
        reader.onerror = (error) => reject(new Error("Không thể đọc tệp"));
        reader.readAsDataURL(file);
    });
};

// HÀM HỖ TRỢ: Lấy Token reCAPTCHA
const getRecaptchaToken = (actionName) => {
    return new Promise((resolve, reject) => {
        grecaptcha.ready(function() {
            grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: actionName }).then(function(token) {
                resolve(token);
            }).catch(function(error) {
                reject(error);
            });
        });
    });
};
    // Tự động tắt kiểm tra chính tả (gạch chân đỏ rối mắt) cho mọi ô nhập liệu xuất hiện trên trang web
document.addEventListener('focusin', function(event) {
    const element = event.target;
    if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
        element.setAttribute('spellcheck', 'false');
    }
});
	// Thêm hai hàm chuyển đổi vào đầu script
    function convertTTForStorage(tt) {
        return String(tt).replace(/\./g, ',');
    }

    function convertTTForDisplay(tt) {
        return String(tt).replace(/,/g, '.');
    }

// === BẮT ĐẦU MÃ MỚI: HÀM HỖ TRỢ SỐ LA MÃ ===
    function numberToRoman(num) {
        const romanMap = [
            { value: 1000, numeral: 'M' },
            { value: 900, numeral: 'CM' },
            { value: 500, numeral: 'D' },
            { value: 400, numeral: 'CD' },
            { value: 100, numeral: 'C' },
            { value: 90, numeral: 'XC' },
            { value: 50, numeral: 'L' },
            { value: 40, numeral: 'XL' },
            { value: 10, numeral: 'X' },
            { value: 9, numeral: 'IX' },
            { value: 5, numeral: 'V' },
            { value: 4, numeral: 'IV' },
            { value: 1, numeral: 'I' }
        ];
        let result = '';
        if (num <= 0) return '';
        for (const { value, numeral } of romanMap) {
            while (num >= value) {
                result += numeral;
                num -= value;
            }
        }
        return result;
    }

    function romanToNumber(roman) {
        if (!roman) return 0;
        const romanMap = { 'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000 };
        let result = 0;
        const r = roman.toUpperCase(); // Đảm bảo là chữ hoa
        for (let i = 0; i < r.length; i++) {
            const current = romanMap[r[i]];
            const next = romanMap[r[i + 1]];
            if (next && current < next) {
                result -= current;
            } else {
                result += current;
            }
        }
        return result;
    }
   	
	// =======================================================
// === CÁC HÀM HELPER CHO LOGIC NHẬP LIỆU MỚI (V4) =======
// =======================================================

/**
 * Tìm giá trị trong một hàng (row) dựa trên danh sách các khóa (keys) có thể có.
 * Ưu tiên các khóa xuất hiện trước trong danh sách.
 */
const findValue = (row, keys, headers) => {
    for (const key of keys) {
        // Tìm header gốc trong file Excel (không phân biệt hoa thường/khoảng trắng)
        const lowerKey = key.toLowerCase().trim();
        const originalHeader = headers.find(h => String(h).toLowerCase().trim() === lowerKey);

        // Nếu tìm thấy header và hàng đó có giá trị cho header này
        if (originalHeader && row[originalHeader] !== undefined && row[originalHeader] !== null && row[originalHeader] !== '') {
            // Kiểm tra xem giá trị có phải là chuỗi rỗng không
            if (String(row[originalHeader]).trim() === '') {
                 continue; // Bỏ qua chuỗi rỗng, thử key tiếp theo
            }
            return row[originalHeader]; // Trả về giá trị tìm thấy
        }
    }
    // Nếu không tìm thấy giá trị hợp lệ nào sau khi thử hết keys
    return undefined;
};


/**
 * Đọc dữ liệu các lần thực hiện từ một hàng Excel.
 */
const readExecutionsForRow = (row, headers) => {
    const executions = [];
    let i = 1;
    const headersSet = new Set(headers.map(h => String(h).toLowerCase().trim())); // Để kiểm tra nhanh

    while (true) {
        const ngayTHKey = `ngày th (${i})`;
        const soLuongKey = `số lượng (${i})`;
        const donGiaKey = `đơn giá (${i})`;
        const thanhTienKey = `thành tiền (${i})`;
        const timestampKey = `timestamp (${i})`;
        const hoSoLinkKey = `hồ sơ link (${i})`;

        // Tìm header gốc tương ứng trong file Excel
        const originalNgayTH = headers.find(h => String(h).toLowerCase().trim() === ngayTHKey);
        const originalSoLuong = headers.find(h => String(h).toLowerCase().trim() === soLuongKey);
        const originalDonGia = headers.find(h => String(h).toLowerCase().trim() === donGiaKey);
        const originalThanhTien = headers.find(h => String(h).toLowerCase().trim() === thanhTienKey);
        const originalTimestamp = headers.find(h => String(h).toLowerCase().trim() === timestampKey);
        const originalHoSoLink = headers.find(h => String(h).toLowerCase().trim() === hoSoLinkKey);

        // Chỉ dừng nếu không có BẤT KỲ cột nào của lần thực hiện thứ 'i' tồn tại
        if (!originalNgayTH && !originalSoLuong && !originalDonGia && !originalThanhTien && !originalTimestamp && !originalHoSoLink) {
            break; // Hết cột thực hiện
        }

        const ngayThucHien = originalNgayTH ? row[originalNgayTH] : '';
        const dvt = originalSoLuong ? parseNumber(row[originalSoLuong]) : 0;
        const donGia = originalDonGia ? parseNumber(row[originalDonGia]) : 0;
        const thanhTien = originalThanhTien ? parseNumber(row[originalThanhTien]) : 0;
        const timestamp = originalTimestamp ? row[originalTimestamp] : null;
        const hoSoLink = originalHoSoLink ? row[originalHoSoLink] : null;

        // Chỉ thêm vào nếu có ít nhất một giá trị hợp lệ
        if (ngayThucHien || dvt > 0 || donGia > 0 || thanhTien > 0 || timestamp || hoSoLink) {
            executions.push({
                ngayThucHien: ngayThucHien || '',
                dvt: dvt,
                donGia: donGia,
                thanhTien: thanhTien,
                timestamp: timestamp || null,
                lanThucHien: i, // Giữ lại số thứ tự lần thực hiện
                hoSoLink: hoSoLink || null
            });
        }
        i++;
    }
    return executions;
};

/**
 * Kiểm tra xem có bất kỳ header nào trong danh sách 'keys'
 * tồn tại trong Set các header của file Excel hay không.
 */
const hasHeaderForField = (keys, headersSet) => {
    for (const key of keys) {
        // Đảm bảo so sánh không phân biệt hoa thường
        if (headersSet.has(key.toLowerCase().trim())) return true;
    }
    return false;
};


// =======================================================
// === KẾT THÚC KHỐI HELPER =============================
// =======================================================

const parseNumber = (str) => {
        if (str === null || str === undefined) return 0;
        let s = String(str).trim();
        if (s === '') return 0;
        const lastDot = s.lastIndexOf('.');
        const lastComma = s.lastIndexOf(',');
        let numberStr;
        if (lastComma > lastDot) {
            numberStr = s.replace(/\./g, '').replace(',', '.');
        } else {
            numberStr = s.replace(/,/g, '');
        }
        const result = parseFloat(numberStr);
        return isNaN(result) ? 0 : result;
    };
    const parseFormattedNumber = (str) => {
        if (str === null || str === undefined) return 0;
        let s = String(str).trim();
        if (s === '') return 0;
        const numberStr = s.replace(/\./g, '').replace(',', '.');
        const result = parseFloat(numberStr);
        return isNaN(result) ? 0 : result;
    };

    function getParentCollectionName() {
        return `congViecMe${currentYear}`;
    }

// === CÁC HÀM HELPER CHO LOGIC IMPORT MỚI ===

/**
 * Hàm chuẩn hóa TT: Loại bỏ khoảng trắng thừa, chuyển dấu phẩy thành dấu chấm,
 * loại bỏ dấu chấm ở cuối câu (ví dụ "1." -> "1").
 */
function normalizeTT(rawTT) {
    if (!rawTT) return '';
    return String(rawTT)
        .trim()                  // Xóa khoảng trắng đầu cuối
        .replace(/\s+/g, '')     // Xóa khoảng trắng ở giữa (VD: "1. 1" -> "1.1")
        .replace(/,/g, '.')      // Chuyển phẩy thành chấm (VD: "1,1" -> "1.1")
        .replace(/\.$/, '')      // Xóa dấu chấm cuối cùng (VD: "A." -> "A")
        .replace(/^\./, '');     // Xóa dấu chấm đầu tiên (nếu có)
}

/**
 * Hàm xác định cấp độ của TT dựa trên Regex
 * ĐÃ SỬA: Chỉ nhận diện số La Mã nếu viết IN HOA.
 */
function detectLevel(tt) {
    // 1. Cấp 1 (Parent): A, B, C... (Chữ cái in hoa)
    const isLevel1_Alpha = /^[A-Z]$/;

    // 2. Cấp 2 (Child - Roman): I, II, III, IV... (CHỈ IN HOA)
    // --- SỬA ĐỔI: Đã xóa cờ 'i' ở cuối regex để bắt buộc khớp chính xác chữ hoa ---
    const isLevel2_Roman = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|XXVIII|XXIX|XXX|XXXI|XXXII|XXXIII|XXXIV|XXXV|XXXVI|XXXVII|XXXVIII|XXXIX)$/;

    // 3. Cấp 3 (Grandchild - Integer): 1, 2, 3...
    const isLevel3_Integer = /^\d+$/;

    // 4. Cấp 4 (GreatGrandchild - x.x): 1.1, 2.3...
    const isLevel4_Decimal = /^\d+\.\d+$/;

    // 5. Cấp 5 (GreatGreatGrandchild - x.x.x): 1.1.1, 2.3.1...
    const isLevel5_Decimal = /^\d+\.\d+\.\d+$/;

    // 6. Giải trình (Justification - *1, *2...)
    const isJustification = /^\*\d+$/; 
    
    // 7. Giải trình con (SubJustification - *1.1, *1.2...)
    const isSubJustification = /^\*\d+\.\d+$/;

    // --- LOGIC PHÂN LOẠI ---
    
    // Kiểm tra số La Mã trước. Vì đã bỏ 'i', nó chỉ khớp I, V, X...
    // Nếu là 'i', 'v' (thường), nó sẽ trả về false và trôi xuống check isJustification bên dưới.
    if (isLevel2_Roman.test(tt)) return 'child';
    
    if (isLevel1_Alpha.test(tt)) return 'parent';
    
    if (isLevel5_Decimal.test(tt)) return 'greatGreatGrandchild';
    if (isLevel4_Decimal.test(tt)) return 'greatGrandchild';
    if (isLevel3_Integer.test(tt)) return 'grandchild';
    
    if (isSubJustification.test(tt)) return 'subJustification';
    
    // Xử lý giải trình (a, b, i...)
    if (isJustification.test(tt)) return 'justification';

    return 'unknown';
}


function buildImportUpdates_Merge(jsonData, headers) {
    console.log('=== START Smart Import Logic (Optimized Regex) ===');
    const updates = {};
    const rootPath = getParentCollectionName();

    // Map header để tìm dữ liệu bất kể chữ hoa/thường
    const headersSet = new Set(headers.map(h => String(h).toLowerCase().trim()));
    const hasExecutionColumns = headers.some(h => String(h).toLowerCase().trim().startsWith('ngày th'));

    // State management: Lưu giữ đường dẫn cha hiện tại
    let state = {
        parent: null,           // Cấp 1 (A)
        child: null,            // Cấp 2 (I)
        grandchild: null,       // Cấp 3 (1)
        greatGrandchild: null,  // Cấp 4 (1.1)
        lastLeaf: null,         // Nút lá cuối cùng (để gán giải trình)
        lastJustification: null // Giải trình cấp 1 cuối cùng (để gán giải trình con)
    };

    const masterDataFieldMapping = {
         noiDung: ['đầu việc/dự án', 'đầu việc/ dự án', 'đầu việc', 'dự án', 'nội dung', 'nội dung công việc', 'nội dung'],
		 tagName: ['tag name', 'tag', 'mã tag', 'ký hiệu'],
         donVi: ['đơn vị tính', 'đ.vị tính', 'đơn vị', 'đvt'],
         soLuong: ['số lượng', 'số lượng vật tư'],
         donGia: ['đơn giá (gt)'],
         chiPhi: ['chi phí', 'chi phi', 'chi phí kế hoạch', 'chi phí kh'],
         tanSuatTH: ['tần suất th', 'tần suất thực hiện'],
         dvThucHien: ['đv th.hiện', 'đơn vị thực hiện', 'đơn vị th', 'đv thực hiện'],
         namPhanBo: ['năm phân bổ', 'năm pb', 'số năm phân bổ', 'nam phan bo'],
         capDo: ['cấp độ', 'cap do'],
         khNamTruoc: ['kh năm trước', 'kế hoạch năm trước'],
         thucHienNamTruoc: ['thực hiện năm trước', 'th nam truoc', 'th năm trước'],
         tgBatDau: ['tđ thực hiện', 'thời điểm th', 'thời điểm thực hiện', 'thời gian thực hiện', 'thời gian th'],
         tgHoanThanh: ['oddo', 'số km', 'odo', 'km dừng', 'tg hoàn thành'],
         ghiChu: ['ghi chú', 'ghi chu']
    };

    jsonData.forEach((row, index) => {
        // 1. Chuẩn hóa TT đầu vào
        const rawTT = String(row.TT || '');
        const tt = normalizeTT(rawTT); // Ví dụ: " 1,1 " -> "1.1"

        if (!tt) return; // Bỏ qua dòng trống TT

        // 2. Xác định cấp độ
        let level = detectLevel(tt);
        
        // --- XỬ LÝ NGOẠI LỆ "I" ---
        // Nếu tt là "I", nó có thể là Cấp 1 (A, B... I, K) hoặc Cấp 2 (I, II).
        // Logic thông minh: Nếu chưa có Cấp 1 nào (đầu file) -> I là cấp 1.
        // Nếu vừa mới có Cấp 1 (ví dụ A) -> I là cấp 2.
        if (tt === 'I') {
            if (state.parent) level = 'child'; // Đã có cha (VD: A), thì I là con
            else level = 'parent'; // Chưa có cha, I là cha đầu tiên (hiếm gặp nhưng có thể)
        }
        
        // Chuẩn hóa TT cho Storage (Đồng nhất chuyển dấu chấm thành phẩy)
        const storageTT = convertTTForStorage(tt);

        let currentPath = '';
        let isTask = false;
        let isLeaf = false;

        try {
            switch (level) {
                case 'parent': // A, B
                    currentPath = `${rootPath}/${storageTT}`;
                    // Reset cây con
                    state.parent = currentPath;
                    state.child = null; state.grandchild = null; state.greatGrandchild = null;
                    state.lastLeaf = null;
                    isTask = true;
                    break;

                case 'child': // I, II
                    if (!state.parent) throw new Error(`Mục "${tt}" thiếu cấp cha (A, B...).`);
                    currentPath = `${state.parent}/children/${storageTT}`;
                    state.child = currentPath;
                    state.grandchild = null; state.greatGrandchild = null;
                    state.lastLeaf = null;
                    isTask = true;
                    break;

                case 'grandchild': // 1, 2
                    if (!state.child) throw new Error(`Mục "${tt}" thiếu cấp cha La Mã (I, II...).`);
                    currentPath = `${state.child}/grandchildren/${storageTT}`;
                    state.grandchild = currentPath;
                    state.greatGrandchild = null;
                    state.lastLeaf = null;
                    isTask = true;
                    break;

                case 'greatGrandchild': // 1.1, 1.2
                    // Kiểm tra logic cha con: 1.1 phải nằm trong 1
                    const parentOfL4 = storageTT.substring(0, storageTT.lastIndexOf(',')); // 1,1 -> 1
                    if (!state.grandchild || !state.grandchild.endsWith(`/${parentOfL4}`)) {
                         // Fallback mềm dẻo: Nếu không khớp cha logic, cứ nhét vào cha gần nhất
                         if (!state.grandchild) throw new Error(`Mục "${tt}" thiếu cấp cha (1, 2...).`);
                    }
                    
                    currentPath = `${state.grandchild}/greatGrandchildren/${storageTT}`;
                    state.greatGrandchild = currentPath;
                    state.lastLeaf = currentPath; // Tạm coi là lá, nếu có con 1.1.1 thì nó sẽ mất quyền lá
                    isTask = true;
                    isLeaf = true; 
                    break;

                case 'greatGreatGrandchild': // 1.1.1
                    // Logic tương tự cấp 4
                    if (!state.greatGrandchild) throw new Error(`Mục "${tt}" thiếu cấp cha (1.1, 1.2...).`);
                    
                    currentPath = `${state.greatGrandchild}/greatGreatGrandchildren/${storageTT}`;
                    state.lastLeaf = currentPath;
                    isTask = true;
                    isLeaf = true;
                    
                    // Cấp 4 bây giờ trở thành container, không còn là lá
                    if (state.greatGrandchild) {
                        updates[`${state.greatGrandchild}/hasChildren`] = true;
                        updates[`${state.greatGrandchild}/executions`] = null; // Xóa thực hiện ở cha nếu có
                    }
                    break;

                case 'justification': // *1, *2
                    // [SỬA LỖI] Ưu tiên gắn Giải trình vào Cấp 4 (greatGrandchild) 
                    // để tránh lỗi Giải trình Cấp 4 bị nhận nhầm thành của Cấp 5 khi Import Excel
                    let targetParent = state.greatGrandchild || state.lastLeaf;
                    if (!targetParent) throw new Error(`Giải trình "${tt}" không có công việc cha.`);
                    
                    currentPath = `${targetParent}/justifications/${storageTT}`;
                    state.lastJustification = currentPath;
                    break;

                case 'subJustification': // a1, a2
                    if (!state.lastJustification) throw new Error(`Giải trình con "${tt}" thiếu giải trình cha (a, b...).`);
                    currentPath = `${state.lastJustification}/subJustifications/${storageTT}`;
                    updates[`${state.lastJustification}/hasSubJustifications`] = true;
                    // Reset giá trị cha vì giờ nó là tổng của con
                    updates[`${state.lastJustification}/chiPhi`] = 0; 
                    break;

                default:
                    console.warn(`Không nhận diện được cấp độ của TT: ${tt}`);
                    return;
            }

            // --- THU THẬP DỮ LIỆU ---
            const data = {};
            // Luôn cập nhật TT chuẩn
            updates[`${currentPath}/tt`] = storageTT;

            for (const [field, keys] of Object.entries(masterDataFieldMapping)) {
                if (hasHeaderForField(keys, headersSet)) {
                    const value = findValue(row, keys, headers);
                    
                    // Nếu ô trong Excel CÓ GIÁ TRỊ (không phải undefined/null)
                    if (value !== undefined && value !== null) {
                        if (['soLuong', 'donGia', 'khNamTruoc', 'chiPhi', 'thucHienNamTruoc', 'namPhanBo'].includes(field)) {
                            data[field] = parseNumber(value);
                        } 
                        else if (field === 'tanSuatTH') {
                            // --- ĐÃ CHỈNH SỬA: ÉP LUẬT TẦN SUẤT CHO EXCEL ---
                            const strVal = String(value).trim();
                            
                            if (strVal === '') {
                                data[field] = 1; // Luật 2: Chuỗi rỗng -> Tính là 1
                            } else if (strVal === '-') {
                                data[field] = 0; // Luật 1: Dấu gạch ngang -> Tính là 0
                            } else {
                                const parsed = parseInt(strVal, 10);
                                // Luật 3 & 4: Số hợp lệ thì giữ nguyên, nhập linh tinh ra NaN thì ép về 0
                                data[field] = isNaN(parsed) ? 0 : parsed; 
                            }
                        } 
                        else {
                            data[field] = value;
                        }
                    } 
                    // Nếu ô trong Excel BỊ BỎ TRỐNG HOÀN TOÀN (undefined)
                    else {
                        if (field === 'tanSuatTH') {
                            data[field] = 1; // Luật 2: Ô tần suất bị bỏ trống -> Ép thành 1 trước khi đưa vào DB
                        } else {
                            data[field] = null; // Các cột khác bỏ trống thì vẫn set null như bình thường
                        }
                    }
                }
            }

            // Xử lý logic đặc biệt cho Chi phí phân bổ
            if ((isLeaf && isTask) && data.namPhanBo && data.namPhanBo > 0) {
                 const cp = data.chiPhi || 0;
                 data.chiPhiPhanBo = Math.round(cp / data.namPhanBo);
            } else if (isLeaf && isTask) {
                 data.chiPhiPhanBo = 0;
            }

            // Xử lý Executions (Thực hiện) - Chỉ dành cho nút lá
            if (isLeaf && isTask && hasExecutionColumns) {
                const executions = readExecutionsForRow(row, headers);
                if (executions.length > 0) {
                    data.executions = executions.reduce((obj, exec, i) => {
                        obj[exec.lanThucHien || (i + 1)] = exec;
                        return obj;
                    }, {});
                } else {
                    data.executions = null;
                }
            }

            // Ghi dữ liệu vào updates
            for (const field in data) {
                updates[`${currentPath}/${field}`] = data[field];
            }

            // Khởi tạo các trường tính toán nếu chưa có
            if (isTask) {
                if (updates[`${currentPath}/chiPhiThucHien`] === undefined) updates[`${currentPath}/chiPhiThucHien`] = 0;
                if (updates[`${currentPath}/keHoachConLai`] === undefined) updates[`${currentPath}/keHoachConLai`] = 0;
            }

        } catch (e) {
            console.error(`Lỗi dòng ${index + 2} (TT: ${tt}): ${e.message}`);
            // Có thể thêm logic thông báo lỗi vào UI tại đây nếu muốn
        }
    });

    console.log(`=== END Smart Import. Total updates: ${Object.keys(updates).length} ===`);
    return updates;
}

    // [HÀM MỚI] Xử lý bật/tắt khóa năm
    window.toggleYearLock = async function(isChecked) {
        if (!isAuthenticated) return showAuthError();

        // Cập nhật trạng thái khóa lên Firebase
        const updates = {};
        updates[`settings/global/lockedYears/${currentYear}`] = isChecked;

        // Logic đặc biệt: Nếu KHÓA (isChecked = true), bắt buộc phải TẮT chế độ sửa đổi (Edit Mode)
        if (isChecked) {
            updates[`settings/global/editModeStatus/${currentYear}`] = false;
            
            // Cập nhật UI checkbox Edit Mode ngay lập tức để phản hồi người dùng
            const editCheckbox = document.getElementById('editModeCheckbox');
            if(editCheckbox) {
                editCheckbox.checked = false;
                editCheckbox.disabled = true; // Vô hiệu hóa checkbox sửa đổi
            }
        } else {
            // Nếu mở khóa, cho phép checkbox sửa đổi hoạt động lại
            const editCheckbox = document.getElementById('editModeCheckbox');
            if(editCheckbox) editCheckbox.disabled = false;
        }

        try {
            await update(ref(db), updates);
            statusDiv.className = isChecked ? 'error' : 'success'; // Error style (đỏ) để cảnh báo khóa
            statusDiv.innerText = isChecked ? `Đã KHÓA hoàn toàn dữ liệu năm ${currentYear}.` : `Đã MỞ KHÓA dữ liệu năm ${currentYear}.`;
        } catch (error) {
            console.error("Lỗi khi khóa năm:", error);
            // Revert UI nếu lỗi
            document.getElementById('lockYearCheckbox').checked = !isChecked;
            alert("Lỗi khi cập nhật trạng thái khóa: " + error.message);
        }
    };

    /**
     * Mở modal hiển thị danh sách Kế hoạch đã duyệt (KHĐD) cho năm hiện tại.
     * Hoạt động ngay cả khi chưa đăng nhập Firebase.
     */
    window.openApprovedPlanModal = async function() {
        const modal = document.getElementById('approvedPlanModal');
        const linksContainer = document.getElementById('approvedPlanLinks');
        const addBtn = document.getElementById('addPlanLinkBtn');
        
        document.getElementById('approvedPlanYear').textContent = currentYear;
        linksContainer.innerHTML = '<p class="loading-text">Đang tải danh sách...</p>';
        modal.style.display = 'block';

        // Hiển thị/ẩn nút "Nhập QĐ" dựa trên trạng thái đăng nhập Firebase
        addBtn.style.display = isAuthenticated ? 'block' : 'none';

        try {
            // Đường dẫn lưu trữ mới, độc lập với 'congViecMeYYYY'
            const dbPath = `approved_plans/${currentYear}`;
            const planRef = ref(db, dbPath);
            const snapshot = await get(planRef);

            if (snapshot.exists()) {
                const data = snapshot.val();
                let html = '';
                // Sắp xếp các link theo thời gian thêm (mới nhất trước)
                const sortedKeys = Object.keys(data).sort((a, b) => 
                    (data[b].timestamp || 0) - (data[a].timestamp || 0)
                );

                for (const key of sortedKeys) {
                    const link = data[key];
                    if (!link.url) continue; // Bỏ qua nếu dữ liệu không có url

                    // Chỉ hiển thị nút Xóa khi đã đăng nhập và cho phép chỉnh sửa
                    const canEdit = isAuthenticated && editModeStatusByYear[currentYear] === true;
const deleteBtnHtml = canEdit ? 
    `<button class="btn-danger btn-action plan-link-delete-btn" onclick="deleteApprovedPlanLink('${key}', '${link.name || link.url}')">Xóa</button>` : '';
                    
                    html += `<div class="plan-link-item">
                                <a href="${link.url}" target="_blank" title="${link.url}">${link.name || link.url}</a>
                                ${deleteBtnHtml}
                             </div>`;
                }
                linksContainer.innerHTML = html || '<p class="empty-text">Chưa có kế hoạch nào được duyệt cho năm này.</p>';
            } else {
                linksContainer.innerHTML = '<p class="empty-text">Chưa có kế hoạch nào được duyệt cho năm này.</p>';
            }
        } catch (error) {
            console.error("Lỗi khi tải Kế hoạch đã duyệt:", error);
            linksContainer.innerHTML = `<p class="empty-text" style="color: red;">Lỗi tải dữ liệu: ${error.message}</p>`;
        }
    }

    /**
     * Xóa một link Kế hoạch đã duyệt khỏi CSDL.
     * Yêu cầu xác thực Firebase.
     */
    window.deleteApprovedPlanLink = async function(linkKey, linkName) {
        if (!isAuthenticated) return showAuthError();
        if (!confirm(`Bạn có chắc chắn muốn xóa link này không?\n\n${linkName}`)) return;

        try {
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đang xóa link...';
            const dbPath = `approved_plans/${currentYear}/${linkKey}`;
            await remove(ref(db, dbPath)); // Sử dụng hàm 'remove' của Firebase
            statusDiv.innerText = 'Đã xóa link thành công.';
            await openApprovedPlanModal(); // Tải lại danh sách trong modal
        } catch (error) {
            console.error("Lỗi khi xóa link:", error);
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi: ${error.message}`;
        }
    }

    /**
     * Mở modal lựa chọn cách thêm link (dán/tải file).
     * Yêu cầu xác thực Firebase.
     */
    window.openAddPlanLinkModal = function() {
        if (!isAuthenticated) return showAuthError();
        // Đóng modal danh sách
        document.getElementById('approvedPlanModal').style.display = 'none';
        // Mở modal lựa chọn
        document.getElementById('addPlanLinkModal').style.display = 'block';
    }

    /**
     * Mở modal để dán link thủ công.
     */
    window.openPasteLinkModal = function() {
        // Đóng modal lựa chọn
        document.getElementById('addPlanLinkModal').style.display = 'none';
        // Xóa giá trị cũ và mở modal dán link
        document.getElementById('pastedLinkName').value = '';
        document.getElementById('pastedLinkUrl').value = '';
        document.getElementById('pasteLinkModal').style.display = 'block';
        document.getElementById('pastedLinkName').focus();
    }

    /**
     * Lưu link được dán thủ công vào CSDL.
     * Yêu cầu xác thực Firebase.
     */
    window.savePastedLink = async function() {
        if (!isAuthenticated) return showAuthError();
        
        const name = document.getElementById('pastedLinkName').value.trim();
        const url = document.getElementById('pastedLinkUrl').value.trim();

        if (!url) {
            alert("Vui lòng nhập đường link (URL).");
            return;
        }
        if (!name) {
            alert("Vui lòng nhập tên hiển thị cho link.");
            return;
        }
        
        const saveData = {
            url: url,
            name: name,
            timestamp: Date.now()
        };

        const saveButton = document.querySelector('#pasteLinkModal .btn-success');
        try {
            saveButton.disabled = true;
            saveButton.textContent = 'Đang lưu...';
            
            const listRef = ref(db, `approved_plans/${currentYear}`);
            await push(listRef, saveData); // Sử dụng 'push' để tạo ID duy nhất

            closeAllModals(); // Đóng modal dán link
            await openApprovedPlanModal(); // Mở lại modal danh sách (sẽ tự động tải lại)
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đã lưu link thành công.';

        } catch (error) {
            console.error("Lỗi khi lưu link:", error);
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi: ${error.message}`;
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Lưu link';
        }
    }


    /**
     * Bắt đầu quy trình tải file Kế hoạch lên Google Drive.
     * Tái sử dụng modal #uploadPdfModal.
     * Yêu cầu xác thực Firebase.
     */
    window.startPlanUploadFlow = async function() {
    if (!isAuthenticated) return showAuthError();
    
    closeAllModals(); 
    statusDiv.innerText = '';
    
    document.getElementById('uploadPdfModalTitle').textContent = 'Tải lên Kế hoạch đã duyệt (PDF)';
    document.getElementById('uploadPdfButton').onclick = window.performApprovedPlanUpload;
    document.getElementById('pdf_file_input').value = '';
    document.getElementById('uploadPdfModal').style.display = 'block';
}

	window.performApprovedPlanUpload = async function() {
    if (!isAuthenticated) return showAuthError();

    const uploadButton = document.getElementById('uploadPdfButton');
    const fileInput = document.getElementById('pdf_file_input');
    const file = fileInput.files[0];
    
    if (!file) { alert('Vui lòng chọn một tệp PDF.'); return; }
    if (file.size > 1024 * 1024 * 50) { alert('Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 50MB.'); return; }
    
    try {
        uploadButton.disabled = true; 
        uploadButton.textContent = 'Đang tải...';
        statusDiv.className = 'success'; 
        statusDiv.innerText = 'Đang xác thực bảo mật và tải tệp lên Google Drive...';
        
        const base64Data = await readFileAsBase64(file);
        const token = await getRecaptchaToken('upload_plan');
        
        const formData = new FormData();
        formData.append('fileName', file.name);
        formData.append('mimeType', file.type);
        formData.append('fileData', base64Data);
        formData.append('recaptchaToken', token);
        
        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.status !== "success") throw new Error(result.message);
        
        const fileLink = result.url;
        statusDiv.innerText = 'Đang cập nhật link vào cơ sở dữ liệu...';

        const saveData = {
            url: fileLink,
            name: file.name, 
            timestamp: Date.now()
        };
        const listRef = ref(db, `approved_plans/${currentYear}`);
        await push(listRef, saveData); 

        closeAllModals(); 
        await openApprovedPlanModal(); 
        statusDiv.className = 'success';
        statusDiv.innerText = `Tải lên và cập nhật Kế hoạch thành công!`;

    } catch (error) {
        console.error('Lỗi khi tải tệp kế hoạch:', error);
        statusDiv.className = 'error';
        statusDiv.innerText = `Đã xảy ra lỗi: ${error.message}`;
    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = 'Tải Lên';
        fileInput.value = '';
    }
};
   // === KẾT THÚC upload KH lên Drive ===

    const loginContainer = document.getElementById('login-container');
    const mainContainer = document.getElementById('container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');




    // ĐỊNH NGHĨA TẤT CẢ CÁC HÀM CẦN THIẾT
    window.initializeYearDropdown = function() {
        const yearSelect = document.getElementById('yearSelect');
        const currentYearValue = new Date().getFullYear();
        const nextYear = currentYearValue + 1;
        
        yearSelect.innerHTML = '';
        
        // 1. Tạo danh sách các năm động (như cũ: Năm hiện tại + 1 năm sau + 3 năm trước)
        const years = [currentYearValue, nextYear];
        for (let i = currentYearValue - 1; i >= currentYearValue - 3; i--) {
            years.unshift(i);
        }
        
        // 2. [THÊM MỚI] Chèn năm 2000 vào đầu mảng để làm Sample
        // Dùng unshift để đưa nó lên vị trí đầu tiên
        years.unshift(2000); 

        // 3. Tạo thẻ <option>
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            
            // Tùy chỉnh hiển thị: Nếu là 2000 thì hiện thêm chữ "(Sample)" cho dễ hiểu
            if (year === 2000) {
                option.textContent = "2000 (Test)";
                option.style.color = "blue"; // Tô màu xanh cho nổi bật (tuỳ chọn)
                option.style.fontWeight = "bold";
            } else {
                option.textContent = year;
            }
            
            yearSelect.appendChild(option);
        });

        // 4. Mặc định vẫn chọn năm hiện tại khi load trang
        currentYear = currentYearValue;
        yearSelect.value = currentYearValue;
    };

   window.openDataManagementModal = function() {
        const modal = document.getElementById('dataManagementModal');
        modal.style.display = 'block';

        const unlockBtn = document.getElementById('unlockButton');
        const toggleDiv = document.getElementById('editModeToggle');
        const checkbox = document.getElementById('editModeCheckbox');
        
        // [THÊM] Các element cho khóa năm
        const lockSection = document.getElementById('lockYearSection');
        const lockCheckbox = document.getElementById('lockYearCheckbox');
        const lblLockYear = document.getElementById('lblLockYear');
        if(lblLockYear) lblLockYear.innerText = currentYear;

        const adminEmail = "admin@pvgaslpg.com.vn";

        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Mở khóa cho phép sửa đổi';

        const currentUser = auth.currentUser;
        const isAdmin = currentUser && currentUser.email === adminEmail;
        const isEditEnabled = editModeStatusByYear[currentYear] === true;
        
        // [THÊM] Kiểm tra trạng thái khóa hiện tại
        const isYearLocked = lockedYears[currentYear] === true;

        if (isAdmin) {
            unlockBtn.style.display = 'none';
            toggleDiv.style.display = 'block';
            
            // Hiện phần khóa năm cho Admin
            if(lockSection) lockSection.style.display = 'block';
            if(lockCheckbox) lockCheckbox.checked = isYearLocked;
            
            checkbox.checked = isEditEnabled;
            
            // [QUAN TRỌNG] Nếu đang khóa năm, vô hiệu hóa checkbox sửa đổi
            checkbox.disabled = isYearLocked;
            
        } else {
            unlockBtn.style.display = 'block';
            toggleDiv.style.display = 'none';
            if(lockSection) lockSection.style.display = 'none'; // Ẩn với user thường
            checkbox.checked = isEditEnabled;
        }
    };

    window.promptForAuthentication = function() {
        closeAllModals();
        
        // Dọn dẹp ô mật khẩu và lỗi hiển thị mỗi khi mở Modal
        const passwordInput = document.getElementById('password');
        if (passwordInput) passwordInput.value = '';
        const loginError = document.getElementById('login-error');
        if (loginError) loginError.style.display = 'none';

        loginContainer.style.display = 'block';
    };

    window.closeLoginModal = function() {
        const loginContainer = document.getElementById('login-container');
        const passwordInput = document.getElementById('password');
        const loginError = document.getElementById('login-error');

        loginContainer.style.display = 'none';
        passwordInput.value = '';
        loginError.style.display = 'none';
    };

    // Đổi tên hàm để phản ánh đúng chức năng mới
window.calculateModalChiPhi = function(input) {
    const row = input.closest('tr');
    if (!row) return;

    const soLuongInput = row.querySelector('input[data-field="soLuong"]');
    const donGiaInput = row.querySelector('input[data-field="donGia"]');
    const chiPhiInput = row.querySelector('input[data-field="chiPhi"]');
    const namPbInput = row.querySelector('input[data-field="namPhanBo"]');
    const cpPbInput = row.querySelector('input[data-field="chiPhiPhanBo"]');
    
    // 1. Tính Chi Phí (nếu là lá)
    let currentChiPhi = 0;
    if (chiPhiInput && !chiPhiInput.disabled) {
        const soLuong = parseNumber(soLuongInput.value);
        const donGia = parseNumber(donGiaInput.value);
        currentChiPhi = soLuong * donGia;
        chiPhiInput.value = formatNumber(currentChiPhi);
    } else if (chiPhiInput) {
        currentChiPhi = parseNumber(chiPhiInput.value);
    }

    // 2. Tính CP Phân Bổ (CHỈ NẾU Ô NĂM PHÂN BỔ ĐƯỢC PHÉP NHẬP)
    if (namPbInput && !namPbInput.disabled && cpPbInput) {
        const nam = parseNumber(namPbInput.value);
        if (nam > 0) {
            cpPbInput.value = formatNumber(Math.round(currentChiPhi / nam));
        } else {
            cpPbInput.value = 0;
        }
    }
};

// Hàm tính quá hạn công việc
window.checkOverdueStatus = function(node, dataYear) {
        if (!node || !node.tgBatDau) return false;
        
        // Trích xuất tất cả các tháng từ chuỗi (vd: T1, t12, T3)
        const regex = /[Tt](\d{1,2})/g;
        let match;
        const months = [];
        while ((match = regex.exec(node.tgBatDau)) !== null) {
            const m = parseInt(match[1], 10);
            if (m >= 1 && m <= 12) months.push(m);
        }
        
        if (months.length === 0) return false;
        months.sort((a, b) => a - b); // Sắp xếp tháng từ nhỏ đến lớn
        
        // Đếm số lần thực hiện (Từ Level 5 nếu có, hoặc Level 4)
        let execCount = 0;
        if (node.greatGreatGrandchildren) {
            const uniqueTimestamps = new Set();
            Object.values(node.greatGreatGrandchildren).forEach(l5 => {
                if (l5.executions) {
                    Object.values(l5.executions).forEach(ex => {
                        if (ex.timestamp) uniqueTimestamps.add(ex.timestamp);
                    });
                }
            });
            execCount = uniqueTimestamps.size;
        } else if (node.executions) {
            execCount = Object.keys(node.executions).length;
        }
        
        // Nếu số lần thực hiện đã bằng hoặc vượt quá số tháng dự kiến -> Không quá hạn
        if (execCount >= months.length) return false;
        
        // Lấy tháng mục tiêu (trừ đi 1 theo index mảng: ví dụ lần 1 -> index 0)
        const targetMonth = months[execCount];
        
        const now = new Date();
        const realYear = now.getFullYear();
        const realMonth = now.getMonth() + 1;
        
        // Logic so sánh thời gian thực tế vs Năm dữ liệu
        if (realYear > dataYear) {
            if (realYear > dataYear + 1) return false; // Quá 1 năm -> Bỏ qua
            if (realYear === dataYear + 1 && realMonth > 2) return false; // Sang năm mới quá 2 tháng -> Bỏ qua
            return true; // Vẫn trong 2 tháng đầu năm sau -> Tính là quá hạn
        } else if (realYear === dataYear) {
            return targetMonth < realMonth; // Nếu tháng mục tiêu nhỏ hơn tháng hiện tại -> Quá hạn
        }
        
        return false;
    };
	
// =========================================================================
    // HÀM XUẤT EXCEL FINAL: NGÀY/TT Ở CẤP CAO NHẤT + CÔNG THỨC CHUẨN
    // =========================================================================
    // Hàm chính: Hiển thị Modal lựa chọn xuất Excel
	window.exportExecutionSearchExcel = function() {
    // Kiểm tra thư viện ExcelJS
    if (typeof ExcelJS === 'undefined') {
        alert("Thư viện ExcelJS chưa được tải. Vui lòng kiểm tra lại kết nối mạng hoặc CDN.");
        return;
    }

    if (!executionGroups || executionGroups.size === 0) {
        alert("Không có dữ liệu thực hiện để xuất!");
        return;
    }

    // ============================================================
    // 1. MODAL LỰA CHỌN (Giữ nguyên logic của bạn)
    // ============================================================
    const modalId = 'exportOptionModal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal'; 
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; font-family: Arial, sans-serif;">
                <span class="close" onclick="document.getElementById('${modalId}').style.display='none'">&times;</span>
                <h2 style="color: #2c3e50;">Tùy chọn Xuất Excel</h2>
                <div style="margin-bottom: 15px; text-align: left;">
                    <div style="margin-bottom: 10px;">
                        <input type="radio" id="optYear" name="exportType" value="year" checked onchange="toggleExportInputs()">
                        <label for="optYear" style="font-weight: bold;">1. Xuất dữ liệu cả năm</label>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <input type="radio" id="optMonth" name="exportType" value="month" onchange="toggleExportInputs()">
                        <label for="optMonth" style="font-weight: bold;">2. Xuất dữ liệu theo tháng</label>
                        <div id="divMonth" style="display:none; margin-left: 25px; margin-top: 5px;">
                            <label>Chọn tháng:</label>
                            <input type="number" id="inputMonth" min="1" max="12" value="${new Date().getMonth() + 1}" style="width: 60px; padding: 3px;">
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <input type="radio" id="optRange" name="exportType" value="range" onchange="toggleExportInputs()">
                        <label for="optRange" style="font-weight: bold;">3. Xuất từ tháng ... đến tháng ...</label>
                        <div id="divRange" style="display:none; margin-left: 25px; margin-top: 5px;">
                            <label>Từ:</label>
                            <input type="number" id="inputStartMonth" min="1" max="12" value="1" style="width: 50px; padding: 3px;">
                            <label>Đến:</label>
                            <input type="number" id="inputEndMonth" min="1" max="12" value="12" style="width: 50px; padding: 3px;">
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <input type="radio" id="optQuarter" name="exportType" value="quarter" onchange="toggleExportInputs()">
                        <label for="optQuarter" style="font-weight: bold;">4. Xuất dữ liệu theo quý</label>
                        <div id="divQuarter" style="display:none; margin-left: 25px; margin-top: 5px;">
                            <label>Nhập quý (1-4):</label>
                            <input type="number" id="inputQuarter" min="1" max="4" value="1" style="width: 60px; padding: 3px;">
                        </div>
                    </div>
                </div>
                <div style="text-align: right; margin-top: 20px;">
                    <button onclick="document.getElementById('${modalId}').style.display='none'" class="btn-secondary" style="margin-right: 10px;">Hủy</button>
                    <button onclick="processExport()" class="btn-primary">Xuất Excel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.style.display = 'block';
    }

    window.toggleExportInputs = function() {
        document.getElementById('divMonth').style.display = document.getElementById('optMonth').checked ? 'block' : 'none';
        document.getElementById('divRange').style.display = document.getElementById('optRange').checked ? 'block' : 'none';
        document.getElementById('divQuarter').style.display = document.getElementById('optQuarter').checked ? 'block' : 'none';
    };

    window.processExport = function() {
        const type = document.querySelector('input[name="exportType"]:checked').value;
        let filterFunc = null;
        let fileNameSuffix = "";

        if (type === 'year') {
            filterFunc = () => true;
            fileNameSuffix = "CaNam";
        } else if (type === 'month') {
            const m = parseInt(document.getElementById('inputMonth').value);
            if (!m || m < 1 || m > 12) { alert("Tháng không hợp lệ"); return; }
            filterFunc = (date) => (date.getMonth() + 1) === m;
            fileNameSuffix = `Thang${m}`;
        } else if (type === 'range') {
            const start = parseInt(document.getElementById('inputStartMonth').value);
            const end = parseInt(document.getElementById('inputEndMonth').value);
            if (!start || !end || start > end) { alert("Khoảng tháng không hợp lệ"); return; }
            filterFunc = (date) => { const m = date.getMonth() + 1; return m >= start && m <= end; };
            fileNameSuffix = `Thang${start}_${end}`;
        } else if (type === 'quarter') {
            const q = parseInt(document.getElementById('inputQuarter').value);
            if (!q || q < 1 || q > 4) { alert("Quý không hợp lệ"); return; }
            filterFunc = (date) => Math.ceil((date.getMonth() + 1) / 3) === q;
            fileNameSuffix = `Quy${q}`;
        }

        document.getElementById(modalId).style.display = 'none';
        executeExportLogicExcelJS(filterFunc, fileNameSuffix);
    };
};

// ============================================================
// 2. HÀM XỬ LÝ CHÍNH SỬ DỤNG EXCELJS (ĐÃ NÂNG CẤP CÔNG THỨC & TỔNG)
// ============================================================
async function executeExportLogicExcelJS(filterCondition, suffix) {
    if (typeof statusDiv !== 'undefined') {
        statusDiv.className = 'success';
        statusDiv.innerText = 'Đang xử lý dữ liệu và tạo file Excel...';
    }

    try {
        // --- A. LỌC DỮ LIỆU ---
        const filteredGroups = new Map();
        for (const [tsKey, l2Map] of executionGroups) {
            let representativeDate = null;
            for(let pMap of l2Map.values()) {
                for(let execs of pMap.values()) {
                    if(execs.length > 0 && execs[0].ngayThucHien) {
                        representativeDate = new Date(execs[0].ngayThucHien);
                        break;
                    }
                }
                if(representativeDate) break;
            }
            if (!representativeDate || !filterCondition(representativeDate)) continue;
            filteredGroups.set(tsKey, l2Map);
        }

        if (filteredGroups.size === 0) {
            alert("Không tìm thấy dữ liệu phù hợp!");
            if(typeof statusDiv !== 'undefined') statusDiv.innerText = '';
            return;
        }

        // --- B. KHỞI TẠO WORKBOOK EXCELJS ---
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'System';
        workbook.created = new Date();
        const sheet = workbook.addWorksheet('TraCuuThucHien', {
            views: [{ showGridLines: false }] 
        });

        // Định nghĩa cột (A=1, B=2, C=3, D=4, E=5, F=6, G=7, H=8)
        sheet.columns = [
            { header: 'TT', key: 'tt', width: 6 },
            { header: 'Ngày thực hiện', key: 'ngayThucHien', width: 14 },
            { header: 'Nội dung', key: 'noiDung', width: 50 },
            { header: 'ĐV thực hiện', key: 'dvThucHien', width: 15 },
            { header: 'Số lượng', key: 'soLuong', width: 10 },
            { header: 'Đơn giá', key: 'donGia', width: 15 },
            { header: 'Thành tiền', key: 'thanhTien', width: 18 },
            { header: 'Link Hồ sơ', key: 'hoSoLink', width: 40 }
        ];

        // --- C. STYLE CƠ BẢN ---
        const borderStyle = {
            top: { style: 'thin', color: { argb: 'FF999999' } },
            left: { style: 'thin', color: { argb: 'FF999999' } },
            bottom: { style: 'thin', color: { argb: 'FF999999' } },
            right: { style: 'thin', color: { argb: 'FF999999' } }
        };

        const headerRow = sheet.getRow(1);
        headerRow.height = 25;
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } }; 
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.eachCell((cell) => { cell.border = borderStyle; });

        let tt = 1;

        // Sắp xếp
        const sortedKeys = Array.from(filteredGroups.keys()).sort((a, b) => {
            const getFirst = (key, sourceMap) => {
                 const l2 = sourceMap.get(key);
                 for(let pMap of l2.values()) for(let execs of pMap.values()) return execs[0];
            };
            const firstA = getFirst(a, filteredGroups), firstB = getFirst(b, filteredGroups);
            const dateA = new Date(firstA?.ngayThucHien || 0), dateB = new Date(firstB?.ngayThucHien || 0);
            return dateB - dateA;
        });

        // Mảng chứa địa chỉ các ô Tổng tiền của Lĩnh vực (L2) để tính Tổng cộng cuối cùng
        const l2TotalCells = [];

        // --- D. DUYỆT VÀ GHI DỮ LIỆU ---
        for (const tsKey of sortedKeys) {
            const l2Map = filteredGroups.get(tsKey);

            for (const [l2Path, parentMap] of l2Map) {
                
                // Lấy thông tin L2
                let l2Name = '';
                if (typeof docDataMap !== 'undefined' && docDataMap.get(l2Path)) {
                    l2Name = docDataMap.get(l2Path).noiDung.toUpperCase();
                }

                let groupDate = '';
                for (const [_, execs] of parentMap) {
                    if (execs.length > 0 && execs[0].ngayThucHien) {
                        groupDate = execs[0].ngayThucHien; break;
                    }
                }

                // 1. GHI DÒNG CẤP 2 (LĨNH VỰC)
                const l2Row = sheet.addRow({
                    tt: tt++,
                    ngayThucHien: groupDate,
                    noiDung: l2Name,
                    thanhTien: 0 
                });
                
                l2Row.font = { bold: true, size: 11 };
                l2Row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } }; 
                l2Row.getCell('tt').alignment = { horizontal: 'center' };
                l2Row.getCell('ngayThucHien').alignment = { horizontal: 'center' };
                l2Row.getCell('thanhTien').numFmt = '#,##0';
                l2Row.eachCell(cell => cell.border = borderStyle);

                // Lưu địa chỉ ô Thành tiền L2 để tính tổng cuối
                l2TotalCells.push(l2Row.getCell('thanhTien').address);

                const l3FormulaCells = []; 

                // Duyệt Cấp 3
                for (const [parentPath, execs] of parentMap) {
                    
                    let parentName = '';
                    if (typeof docDataMap !== 'undefined' && docDataMap.get(parentPath)) {
                        parentName = docDataMap.get(parentPath).noiDung;
                    }

                    // 2. GHI DÒNG CẤP 3 (ĐẦU MỤC)
                    const l3Row = sheet.addRow({
                        noiDung: `  ${parentName}`,
                        thanhTien: 0
                    });

                    l3Row.font = { bold: true, color: { argb: 'FF2c3e50' } };
                    l3Row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF5FB' } }; 
                    l3Row.getCell('thanhTien').numFmt = '#,##0';
                    l3Row.eachCell(cell => cell.border = borderStyle);

                    l3FormulaCells.push(l3Row.getCell('thanhTien').address);

                    const startDetailRow = sheet.lastRow.number + 1; 

                    // 3. GHI CHI TIẾT (CẤP 4)
                    execs.forEach(exec => {
                        const soLuong = exec.dvt ? parseFloat(exec.dvt) : 0;
                        const donGia = exec.donGia ? parseFloat(exec.donGia) : 0;
                        let thanhTienVal = exec.thanhTien ? parseFloat(exec.thanhTien) : 0;

                        const detailRow = sheet.addRow({
                            noiDung: `    ${exec.noiDung}`,
                            dvThucHien: exec.dvThucHien || '',
                            soLuong: soLuong || null,
                            donGia: donGia || null,
                            thanhTien: thanhTienVal, // Giá trị mặc định nếu ko có công thức
                            hoSoLink: exec.hoSoLink || ''
                        });
                        
                        detailRow.font = { size: 10 };
                        detailRow.getCell('dvThucHien').alignment = { horizontal: 'center' };
                        detailRow.getCell('soLuong').alignment = { horizontal: 'center' };
                        detailRow.getCell('donGia').numFmt = '#,##0';
                        detailRow.getCell('thanhTien').numFmt = '#,##0';
                        
                        // [LOGIC MỚI] BỔ SUNG CÔNG THỨC NHÂN: THÀNH TIỀN = SỐ LƯỢNG * ĐƠN GIÁ
                        if (soLuong > 0 && donGia > 0) {
                            const currentRowNum = detailRow.number;
                            // Cột E là Số lượng, F là Đơn giá -> Thành tiền (G) = E*F
                            detailRow.getCell('thanhTien').value = {
                                formula: `E${currentRowNum}*F${currentRowNum}`,
                                result: soLuong * donGia 
                            };
                        }

                        if (exec.hoSoLink) {
                            const linkCell = detailRow.getCell('hoSoLink');
                            const linkText = exec.hoSoLink.length > 50 ? exec.hoSoLink.substring(0, 50) + '...' : exec.hoSoLink;
                            linkCell.value = { text: linkText, hyperlink: exec.hoSoLink };
                            linkCell.font = { color: { argb: 'FF0000FF' }, underline: true };
                        }
                        
                        detailRow.eachCell(cell => cell.border = borderStyle);
                    });

                    const endDetailRow = sheet.lastRow.number;

                    // 4. CÔNG THỨC SUM CẤP 3
                    if (endDetailRow >= startDetailRow) {
                        l3Row.getCell('thanhTien').value = {
                            formula: `SUM(G${startDetailRow}:G${endDetailRow})`
                        };
                    }
                }

                // 5. CÔNG THỨC SUM CẤP 2
                if (l3FormulaCells.length > 0) {
                    l2Row.getCell('thanhTien').value = {
                        formula: l3FormulaCells.join('+')
                    };
                }
            }
        }

        // ============================================================
        // [LOGIC MỚI] DÒNG TỔNG CỘNG CUỐI CÙNG
        // ============================================================
        if (l2TotalCells.length > 0) {
            // Thêm 1 dòng trống cho thoáng
           // sheet.addRow([]); 

            const totalRow = sheet.addRow({
                tt: '',
				ngayThucHien: 'TỔNG CỘNG',
                thanhTien: 0
            });

            // Style cho dòng Tổng cộng
            totalRow.height = 30;
            totalRow.font = { bold: true, size: 11, color: { argb: 'FFDC143C' } }; // Đỏ thẫm
            totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Vàng
            
            
			// Merge các ô từ A đến F cho chữ "TỔNG CỘNG"
            const rowNum = totalRow.number;
			sheet.mergeCells(`B${rowNum}:F${rowNum}`);
            totalRow.getCell('ngayThucHien').alignment = { horizontal: 'center', vertical: 'middle' }; // Căn giữa nội dung merge
            
            // Định dạng tiền tệ
            totalRow.getCell('thanhTien').numFmt = '#,##0';
            totalRow.getCell('thanhTien').alignment = { vertical: 'middle' };

            // Công thức tổng: Cộng tất cả các ô L2 lại
            // Ví dụ: =G5+G15+G25...
            totalRow.getCell('thanhTien').value = {
                formula: l2TotalCells.join('+')
            };

            // Kẻ khung đậm cho dòng tổng
            const thickBorder = { style: 'thin', color: { argb: 'FF000000' } };
            totalRow.eachCell(cell => {
                cell.border = { top: thickBorder, bottom: thickBorder, left: thickBorder, right: thickBorder };
            });
        }
        // ============================================================


        // --- E. XUẤT FILE ---
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TK_ThucHien_${suffix}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        if(typeof statusDiv !== 'undefined') {
            statusDiv.innerText = 'Xuất Excel thành công!';
            setTimeout(() => { statusDiv.innerText = ''; }, 3000);
        }

    } catch (error) {
        console.error(error);
        alert("Lỗi xuất Excel: " + error.message);
        if(typeof statusDiv !== 'undefined') statusDiv.innerText = '';
    }
}
    // === KẾT THÚC BỘ CÁC HÀM XUẤT EXCEL TẠI MODAL TRA CỨU THỰC HIỆN ===

    window.calculateThanhTien = function(input) {
    const row = input.closest('tr');
    if (!row) return;

    const soLuongInput = row.querySelector('input[data-field="dvt"]');
    const donGiaInput = row.querySelector('input[data-field="donGia"]');
    const thanhTienInput = row.querySelector('input[data-field="thanhTien"]');

    const soLuong = parseNumber(soLuongInput.value);
    const donGia = parseNumber(donGiaInput.value);
    const cost = soLuong * donGia;

    // Cập nhật giá trị của ô thành tiền
    thanhTienInput.value = formatNumber(cost);
};

/**
 * HÀM TÍNH TOÁN LẠI TOÀN BỘ (PHIÊN BẢN TỐI ƯU HÓA - BATCH PROCESSING)
 */
	window.recalculateAllCostsAndReload = async function(showConfirm = true) {
    if (typeof isAuthenticated !== 'undefined' && !isAuthenticated) {
        if (typeof showAuthError === 'function') return showAuthError();
        else { alert("Vui lòng đăng nhập!"); return; }
    }

    if (showConfirm && !confirm("Xác nhận tính toán lại toàn bộ dữ liệu?")) {
        return;
    }

    const button = document.querySelector('button[onclick="recalculateAllCostsAndReload()"]');
    if(button) button.disabled = true;

    try {
        if(typeof statusDiv !== 'undefined') {
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đang tải dữ liệu và tính toán lại...';
        }

        const rootRef = ref(db, getParentCollectionName());
        const snapshot = await get(rootRef);

        if (!snapshot.exists()) {
            if(statusDiv) statusDiv.innerText = 'Không có dữ liệu.';
            if(button) button.disabled = false;
            return;
        }

        const allData = snapshot.val();
        const updates = {}; 

        // --- HÀM PHỤ TRỢ ---
        const safeFloat = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? 0 : num;
        };

        const calculateCpCap1 = (chiPhi, capDo) => {
            const cd = String(capDo || '1').trim();
            if (cd === '1') return chiPhi;
            if (cd === '6t') return chiPhi * 0.5;
            return 0;
        };

        const calculateJustificationCost = (node, path) => {
            let total = 0;
            let hasJust = false;
            if (node.justifications && Object.keys(node.justifications).length > 0) {
                hasJust = true;
                Object.keys(node.justifications).forEach(jKey => {
                    const j = node.justifications[jKey];
                    let jCost = 0;
                    if(j.subJustifications && Object.keys(j.subJustifications).length > 0) {
                        Object.keys(j.subJustifications).forEach(sKey => {
                            const s = j.subJustifications[sKey];
                            const sCost = safeFloat(s.soLuong) * safeFloat(s.donGia);
                            updates[`${path}/justifications/${jKey}/subJustifications/${sKey}/chiPhi`] = sCost;
                            jCost += sCost;
                        });
                    } else {
                        jCost = safeFloat(j.soLuong) * safeFloat(j.donGia);
                    }
                    updates[`${path}/justifications/${jKey}/chiPhi`] = jCost;
                    total += jCost;
                });
            }
            return { total, hasJust };
        };

        // --- DUYỆT CÂY (BOTTOM-UP) ---
        Object.keys(allData).forEach(pId => {
            const parent = allData[pId];
            const pPath = `${getParentCollectionName()}/${pId}`;
            
            // Khai báo ở Cấp 1
            let pTotalChiPhi = 0, pTotalThucHien = 0, pTotalPhanBo = 0, pTotalCpCap1 = 0, pTotalKhNamTruoc = 0, pTotalThucHienNamTruoc = 0;

            if (parent.children) {
                Object.keys(parent.children).forEach(cId => {
                    const child = parent.children[cId];
                    const cPath = `${pPath}/children/${cId}`;
                    // Khai báo ở Cấp 2
                    let cTotalChiPhi = 0, cTotalThucHien = 0, cTotalPhanBo = 0, cTotalCpCap1 = 0, cTotalKhNamTruoc = 0, cTotalThucHienNamTruoc = 0;

                    if (child.grandchildren) {
                        Object.keys(child.grandchildren).forEach(gcId => {
                            const grandchild = child.grandchildren[gcId];
                            const gcPath = `${cPath}/grandchildren/${gcId}`;
                            let gcTotalThucHien = 0, gcTotalPhanBoFromL4 = 0, gcTotalCpCap1FromL4 = 0, gcTotalChiPhiFromL4 = 0, gcTotalKhNamTruocFromL4 = 0, gcTotalThucHienNamTruocFromL4 = 0;

                            const hasL4 = grandchild.greatGrandchildren && Object.keys(grandchild.greatGrandchildren).length > 0;

                            if (hasL4) {
                                Object.keys(grandchild.greatGrandchildren).forEach(ggcId => {
                                    const ggc = grandchild.greatGrandchildren[ggcId];
                                    const ggcPath = `${gcPath}/greatGrandchildren/${ggcId}`;

                                    // 1. Level 5 (Tính toán chi phí thực hiện từ cấp 5)
                                    let sumL5Actual = 0;
                                    if (ggc.greatGreatGrandchildren) {
                                        Object.keys(ggc.greatGreatGrandchildren).forEach(l5Id => {
                                            const l5 = ggc.greatGreatGrandchildren[l5Id];
                                            const l5Path = `${ggcPath}/greatGreatGrandchildren/${l5Id}`;
                                            let l5Actual = 0;
                                            if (l5.executions) Object.values(l5.executions).forEach(ex => l5Actual += safeFloat(ex.thanhTien));
                                            sumL5Actual += l5Actual;

                                            const l5JustCalc = calculateJustificationCost(l5, l5Path);
                                            let finalChiPhiL5 = l5JustCalc.hasJust ? l5JustCalc.total : safeFloat(l5.chiPhi);

                                            updates[`${l5Path}/chiPhiThucHien`] = l5Actual;
                                            updates[`${l5Path}/chiPhi`] = finalChiPhiL5;
                                            updates[`${l5Path}/keHoachConLai`] = null; 
                                            updates[`${l5Path}/daThucHien`] = (l5Actual > 0) ? true : null;
                                        });
                                    }

                                    // 2. Level 4
                                    const namPhanBoL4 = parseInt(ggc.namPhanBo) || 1;
                                    const capDoL4 = String(ggc.capDo || '1');
                                    updates[`${ggcPath}/namPhanBo`] = namPhanBoL4;
                                    updates[`${ggcPath}/capDo`] = capDoL4;

                                    // --- [BỔ SUNG LOGIC MỚI TẠI ĐÂY] ---
                                    let directExecution = 0;
                                    let hasLevel4Link = false; // Biến cờ đánh dấu có link hồ sơ

                                    if (ggc.executions) {
                                        Object.values(ggc.executions).forEach(ex => {
                                            directExecution += safeFloat(ex.thanhTien);
                                            // Kiểm tra nếu có link hồ sơ khác rỗng
                                            if (ex.hoSoLink && ex.hoSoLink.trim() !== '') {
                                                hasLevel4Link = true;
                                            }
                                        });
                                    }
                                    
                                    const totalActualL4 = directExecution + sumL5Actual;

                                    const l4JustCalc = calculateJustificationCost(ggc, ggcPath);
                                    let finalChiPhiL4 = l4JustCalc.hasJust ? l4JustCalc.total : safeFloat(ggc.chiPhi);

                                    const finalPhanBoL4 = Math.round(finalChiPhiL4 / namPhanBoL4);
                                    const cpCap1L4 = calculateCpCap1(finalChiPhiL4, capDoL4);
                                    
                                    const isPsL4 = String(capDoL4).trim().toLowerCase() === 'ps';
                                    const keHoachConLaiL4 = isPsL4 ? 0 : (finalChiPhiL4 - totalActualL4);
                                    
                                    // [LOGIC MỚI]: Ghi nhận quá hạn Level 4
                                    const isOverdue = window.checkOverdueStatus(ggc, parseInt(currentYear));
                                    updates[`${ggcPath}/quaHan`] = isOverdue;

                                    updates[`${ggcPath}/chiPhi`] = finalChiPhiL4;
                                    updates[`${ggcPath}/chiPhiThucHien`] = totalActualL4;
                                    updates[`${ggcPath}/keHoachConLai`] = keHoachConLaiL4;
                                    updates[`${ggcPath}/chiPhiPhanBo`] = finalPhanBoL4;
                                    updates[`${ggcPath}/cpCap1`] = cpCap1L4;

                                    // --- [CẬP NHẬT LOGIC GẮN CỜ DA_THUC_HIEN] ---
                                    // Điều kiện 1: Có phát sinh chi phí thực hiện (Level 4 hoặc 5)
                                    const hasMoney = (directExecution > 0 || sumL5Actual > 0);
                                    
                                    // Điều kiện 2: Chi phí = 0 VÀ Có link hồ sơ (Yêu cầu mới)
                                    const isZeroCostWithLink = (finalChiPhiL4 === 0 && hasLevel4Link);

                                    updates[`${ggcPath}/daThucHien`] = (hasMoney || isZeroCostWithLink) ? true : null;
                                    // ---------------------------------------------

                                    gcTotalThucHien += totalActualL4;
                                    gcTotalPhanBoFromL4 += finalPhanBoL4;
                                    gcTotalCpCap1FromL4 += cpCap1L4;
                                    gcTotalChiPhiFromL4 += finalChiPhiL4;
                                    
                                    // [BỔ SUNG] Thu thập KH và TH năm trước từ Cấp 4
                                    gcTotalKhNamTruocFromL4 += safeFloat(ggc.khNamTruoc);
                                    gcTotalThucHienNamTruocFromL4 += safeFloat(ggc.thucHienNamTruoc);
                                });
                            } 

                            // 3. Level 3
                            let finalChiPhiL3 = safeFloat(grandchild.chiPhi); 
                            let finalPhanBoL3 = 0, finalCpCap1L3 = 0;
                            // [BỔ SUNG] Khai báo biến giữ giá trị
                            let finalKhNamTruocL3 = safeFloat(grandchild.khNamTruoc);
                            let finalThucHienNamTruocL3 = safeFloat(grandchild.thucHienNamTruoc);

                            if (!hasL4) {
                                const namPhanBoL3 = parseInt(grandchild.namPhanBo) || 1;
                                const capDoL3 = String(grandchild.capDo || '1');
                                updates[`${gcPath}/namPhanBo`] = namPhanBoL3;
                                updates[`${gcPath}/capDo`] = capDoL3;
                                finalPhanBoL3 = Math.round(finalChiPhiL3 / namPhanBoL3);
                                finalCpCap1L3 = calculateCpCap1(finalChiPhiL3, capDoL3);
                            } else {
                                finalPhanBoL3 = gcTotalPhanBoFromL4;
                                finalCpCap1L3 = gcTotalCpCap1FromL4;
                                finalChiPhiL3 = gcTotalChiPhiFromL4; 
                                
                                // [BỔ SUNG] Ép giá trị Cấp 3 bằng tổng Cấp 4
                                finalKhNamTruocL3 = gcTotalKhNamTruocFromL4;
                                finalThucHienNamTruocL3 = gcTotalThucHienNamTruocFromL4;
                            }
                            
                            const capDoL3Check = String(grandchild.capDo || '1');
                            const isPsL3 = capDoL3Check.trim().toLowerCase() === 'ps';
                            const keHoachConLaiL3 = isPsL3 ? 0 : (finalChiPhiL3 - gcTotalThucHien);

                            updates[`${gcPath}/chiPhi`] = finalChiPhiL3;
                            updates[`${gcPath}/chiPhiThucHien`] = gcTotalThucHien;
                            updates[`${gcPath}/keHoachConLai`] = keHoachConLaiL3;
                            updates[`${gcPath}/chiPhiPhanBo`] = finalPhanBoL3;
                            updates[`${gcPath}/cpCap1`] = finalCpCap1L3;
                            
                            // [BỔ SUNG] Đẩy dữ liệu lên Firebase
                            updates[`${gcPath}/khNamTruoc`] = finalKhNamTruocL3;
                            updates[`${gcPath}/thucHienNamTruoc`] = finalThucHienNamTruocL3;

                            updates[`${gcPath}/daThucHien`] = (gcTotalThucHien > 0) ? true : null;

                            cTotalChiPhi += finalChiPhiL3;
                            cTotalThucHien += gcTotalThucHien;
                            cTotalPhanBo += finalPhanBoL3;
                            cTotalCpCap1 += finalCpCap1L3;
                            
                            // [BỔ SUNG] Đẩy dữ liệu lên Cấp 2
                            cTotalKhNamTruoc += finalKhNamTruocL3;
                            cTotalThucHienNamTruoc += finalThucHienNamTruocL3;
                        });
                    }

                    // 4. Level 2
                    const capDoL2 = String(child.capDo || '').trim();
                    const isPsL2 = capDoL2.toLowerCase() === 'ps';
                    updates[`${cPath}/keHoachConLai`] = isPsL2 ? 0 : (cTotalChiPhi - cTotalThucHien);

                    updates[`${cPath}/chiPhi`] = cTotalChiPhi;
                    updates[`${cPath}/chiPhiThucHien`] = cTotalThucHien;
                    updates[`${cPath}/chiPhiPhanBo`] = cTotalPhanBo;
                    updates[`${cPath}/cpCap1`] = cTotalCpCap1;
					updates[`${cPath}/khNamTruoc`] = cTotalKhNamTruoc;
                    updates[`${cPath}/thucHienNamTruoc`] = cTotalThucHienNamTruoc;
                    updates[`${cPath}/daThucHien`] = (cTotalThucHien > 0) ? true : null;

                    pTotalChiPhi += cTotalChiPhi;
                    pTotalThucHien += cTotalThucHien;
                    pTotalPhanBo += cTotalPhanBo;
                    pTotalCpCap1 += cTotalCpCap1;
					pTotalKhNamTruoc += cTotalKhNamTruoc;
                    pTotalThucHienNamTruoc += cTotalThucHienNamTruoc;
                });
            }

            // 5. Level 1
            const capDoL1 = String(parent.capDo || '').trim();
            const isPsL1 = capDoL1.toLowerCase() === 'ps';
            updates[`${pPath}/keHoachConLai`] = isPsL1 ? 0 : (pTotalChiPhi - pTotalThucHien);

            updates[`${pPath}/chiPhi`] = pTotalChiPhi;
            updates[`${pPath}/chiPhiThucHien`] = pTotalThucHien;
            updates[`${pPath}/chiPhiPhanBo`] = pTotalPhanBo;
            updates[`${pPath}/cpCap1`] = pTotalCpCap1;
			updates[`${pPath}/khNamTruoc`] = pTotalKhNamTruoc;
            updates[`${pPath}/thucHienNamTruoc`] = pTotalThucHienNamTruoc;
            updates[`${pPath}/daThucHien`] = (pTotalThucHien > 0) ? true : null;
        });

        if(typeof statusDiv !== 'undefined') statusDiv.innerText = 'Đang lưu dữ liệu xuống Database...';
        if (Object.keys(updates).length > 0) await update(ref(db), updates);

        if (typeof calculateSummaryData === 'function') await calculateSummaryData();
        if (typeof fetchData === 'function') await fetchData();
        
        if(typeof statusDiv !== 'undefined') {
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đã tính toán xong!';
        }

    } catch (error) {
        console.error("Lỗi tính toán:", error);
        if(typeof statusDiv !== 'undefined') {
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi: ${error.message}`;
        }
    } finally {
        if(button) button.disabled = false;
    }
};

/**
 * HÀM HELPER MỚI
 * Trả về một đối tượng chứa các trường cần set về 'null' cho một nút cha.
 */
function getCleanupFieldsForParentNode(path) {
    return {
        [`${path}/donVi`]: null,
        [`${path}/soLuong`]: null,
        [`${path}/donGia`]: null,
        [`${path}/tanSuatTH`]: null
        // Chúng ta giữ lại 'dvThucHien' và 'capDo' vì chúng có thể hữu ích
    };
}

    window.logoutUser = async function() {
        if(confirm('Bạn có muốn đăng xuất và quay về chế độ chỉ xem không?')) {
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Lỗi đăng xuất:", error);
                statusDiv.className = 'error';
                statusDiv.innerText = 'Lỗi khi đăng xuất: ' + error.message;
            }
        }
    };

    window.deleteSelectedTasks = async function() {
        if (!isAuthenticated) return showAuthError();

        // 1. Kiểm tra đầu vào
        if (selectedTasks.size === 0 && selectedJustifications.size === 0) {
            alert("Vui lòng chọn ít nhất một mục để xoá.");
            return;
        }

        // --- BƯỚC QUAN TRỌNG: LỌC DANH SÁCH XOÁ (GIỮ NGUYÊN LOGIC GỐC) ---
        const rawSelectedPaths = [...selectedTasks, ...selectedJustifications];
        
        const pathsToDelete = rawSelectedPaths.filter(parentPath => {
            const hasChildSelected = rawSelectedPaths.some(childPath => 
                childPath !== parentPath && childPath.startsWith(parentPath + '/')
            );
            return !hasChildSelected;
        });

        // 2. Xác nhận xóa
        if (!confirm(`Bạn có chắc chắn muốn xoá ${pathsToDelete.length} mục chi tiết đã chọn?`)) return;

        // 3. Kiểm tra an toàn
        try {
            for (const path of pathsToDelete) {
                const execSnapshot = await get(ref(db, `${path}/executions`));
                if (execSnapshot.exists() && Object.keys(execSnapshot.val()).length > 0) {
                    alert(`Không thể xóa: Một số mục đã có dữ liệu nghiệm thu (thực hiện).`);
                    return;
                }
            }
        } catch (error) {
            console.error(error);
            return;
        }

        const deleteButton = document.getElementById('deleteSelectedBtn');
        try {
            deleteButton.disabled = true;
            if(statusDiv) {
                statusDiv.className = 'success';
                statusDiv.innerText = "Đang xử lý...";
            }

            const updates = {};
            
            // Map theo dõi Cha -> Số lượng con bị xóa
            const tasksParentMap = new Map(); 
            const justParentMap = new Map();
            const pathsToRecalculate = new Set();

            // --- BƯỚC A: Tạo lệnh xóa cho các mục cấp thấp nhất ---
            for (const path of pathsToDelete) {
                updates[path] = null; // Lệnh xóa

                if (path.includes('/justifications/')) {
                    if (path.includes('/subJustifications/')) {
                        const parentPath = path.substring(0, path.lastIndexOf('/subJustifications/'));
                        justParentMap.set(parentPath, (justParentMap.get(parentPath) || 0) + 1);
                    } else {
                        const taskPath = path.substring(0, path.indexOf('/justifications/'));
                        pathsToRecalculate.add(taskPath);
                    }
                } else {
                    let parentPath = null;
                    if (path.includes('/greatGreatGrandchildren/')) {
                        parentPath = path.substring(0, path.lastIndexOf('/greatGreatGrandchildren/'));
                    } else if (path.includes('/greatGrandchildren/')) {
                         parentPath = path.substring(0, path.lastIndexOf('/greatGrandchildren/'));
                    }
                    
                    if (parentPath) {
                        tasksParentMap.set(parentPath, (tasksParentMap.get(parentPath) || 0) + 1);
                    }
                }
            }

            // --- BƯỚC B: Xử lý Task Cha (Reset nếu mất hết con) ---
            for (const [parentPath, deleteCount] of tasksParentMap.entries()) {
                if (updates.hasOwnProperty(parentPath)) continue; 

                let childrenKey = 'greatGreatGrandchildren'; 
                if (!parentPath.includes('greatGrandchildren')) {
                     childrenKey = 'greatGreatGrandchildren';
                }
                
                const snap = await get(ref(db, `${parentPath}/${childrenKey}`));
                const currentDbCount = snap.exists() ? Object.keys(snap.val()).length : 0;

                // Nếu số lượng con hiện có == số lượng đang xóa => Hết con
                if (currentDbCount === deleteCount) {
                    // Cập nhật Cha: Bỏ cờ hasChildren
                    updates[`${parentPath}/hasChildren`] = false;
                    
                    // [SỬA LỖI TẠI ĐÂY]
                    // Chỉ reset thực hiện về 0. GIỮ NGUYÊN KẾ HOẠCH (chiPhi)
                    updates[`${parentPath}/chiPhiThucHien`] = 0;
                    
                    // CÁC DÒNG DƯỚI ĐÂY ĐÃ BỊ VÔ HIỆU HÓA ĐỂ KHÔNG RESET DỮ LIỆU CỦA CHA
                    // updates[`${parentPath}/chiPhi`] = 0;  <-- ĐÃ BỎ
                    // updates[`${parentPath}/keHoachConLai`] = 0; <-- ĐÃ BỎ (Để hàm tính toán tự xử lý: Plan - 0)
                    // updates[`${parentPath}/soLuong`] = null; <-- ĐÃ BỎ
                    // updates[`${parentPath}/donVi`] = null;   <-- ĐÃ BỎ
                    // updates[`${parentPath}/donGia`] = null;  <-- ĐÃ BỎ
                    // updates[`${parentPath}/namPhanBo`] = null; <-- ĐÃ BỎ
                    // updates[`${parentPath}/chiPhiPhanBo`] = 0; <-- ĐÃ BỎ
                    
                    pathsToRecalculate.add(parentPath);
                } else {
                    pathsToRecalculate.add(parentPath);
                }
            }

            // --- BƯỚC C: Xử lý Justification Cha ---
            for (const [parentPath, deleteCount] of justParentMap.entries()) {
                if (updates.hasOwnProperty(parentPath)) continue;

                const snap = await get(ref(db, `${parentPath}/subJustifications`));
                const currentDbCount = snap.exists() ? Object.keys(snap.val()).length : 0;

                if (currentDbCount === deleteCount) {
                    updates[`${parentPath}/hasSubJustifications`] = false;
                    updates[`${parentPath}/chiPhi`] = 0; // Giải trình thì reset về 0 là đúng logic
                    
                    const taskValueOfJust = parentPath.split('/justifications')[0];
                    pathsToRecalculate.add(taskValueOfJust);
                }
            }

            // --- BƯỚC D: Thực hiện Update ---
            await update(ref(db), updates);

            // --- BƯỚC E: Tính toán lại chi phí lan truyền ---
            if (pathsToRecalculate.size > 0) {
                statusDiv.innerText = "Đang cập nhật chi phí...";
                const validPaths = Array.from(pathsToRecalculate).filter(p => !updates.hasOwnProperty(p));
                
                if (validPaths.length > 0) {
                     await recalculateCostsForParents(validPaths);
                }
            }

            await fetchData();
            statusDiv.innerText = "Xoá thành công!";
            
            selectedTasks.clear();
            selectedJustifications.clear();
            updateButtonStates();

        } catch (error) {
            console.error("Lỗi xóa:", error);
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi: ${error.message}`;
        } finally {
            deleteButton.disabled = false;
        }
    };

    window.exportToExcel = function(type) {
    // Gán giá trị 'simplified' cho Excel 1 và 'full' cho Excel 2
    activeExportType = type === 1 ? 'simplified' : 'full';
    document.getElementById('exportOptionsModal').style.display = 'block';
};

    // =========================================================================
    // NHÓM CÁC HÀM ĐỂ MỞ MODAL THỰC HIỆN HÀNG LOẠT
    // =========================================================================
// 1. HÀM ĐIỀU HƯỚNG CHÍNH KHI BẤM NÚT "THỰC HIỆN CÔNG VIỆC ĐÃ CHỌN"
// =========================================================================
	window.openMultiExecutionModal = function() {
    if (!isAuthenticated) return showAuthError();

    const allSelected = [...selectedTasks];

    // Lọc ra các task Cấp 4 và Cấp 5 có trong danh sách đang được chọn
    const l4Tasks = allSelected.filter(p => p.includes('/greatGrandchildren/') && !p.includes('/greatGreatGrandchildren/'));
    const l5Tasks = allSelected.filter(p => p.includes('/greatGreatGrandchildren/'));

    // Kiểm tra: Nếu có DUY NHẤT 1 task Cấp 4 liên quan
    if (l4Tasks.length === 1) {
        const singlePath = l4Tasks[0];
        
        // Đảm bảo không có task Cấp 5 "lạc loài" nào từ nhánh Cấp 4 khác bị dính vào
        const allL5BelongToSinglePath = l5Tasks.every(p => p.startsWith(singlePath + '/'));

        if (allL5BelongToSinglePath) {
            const taskData = docDataMap.get(singlePath);
            
            if (taskData) {
                // TÌNH HUỐNG 1: Đã có Cấp 5 (Vật tư chi tiết)
                const hasLevel5 = taskData.hasChildren === true || 
                                  (taskData.greatGreatGrandchildren && Object.keys(taskData.greatGreatGrandchildren).length > 0);
                
                // TÌNH HUỐNG 2: Đã có Executions (Thực hiện trực tiếp)
                const hasDirectExecutions = taskData.executions && Object.keys(taskData.executions).length > 0;

                if (hasLevel5) {
                    // Chạy luôn form kê khai vật tư, bỏ qua modal 2 lựa chọn
                    openCombinedAddModal(singlePath);
                    return;
                } 
                else if (hasDirectExecutions) {
                    // Chạy luôn form nghiệm thu tổng, ép mảng truyền vào chỉ chứa task Cấp 4
                    executeNormalMultiExecution([singlePath]);
                    return;
                } 
                else {
                    // TÌNH HUỐNG 3: Hoàn toàn mới -> Hiện modal 2 lựa chọn
                    showLevel4ChoiceModal(singlePath);
                    return;
                }
            }
        }
    }

    // Trường hợp 1 gốc: Chọn nhiều Cấp 4 khác nhau, hoặc chỉ chọn độc lập Cấp 5, v.v.
    executeNormalMultiExecution(allSelected);
};

// =========================================================================
// 2. HÀM TẠO VÀ HIỂN THỊ MODAL 2 LỰA CHỌN CHO TASK CẤP 4
// =========================================================================
window.showLevel4ChoiceModal = function(path) {
    const modalId = 'level4ChoiceModal';
    let modal = document.getElementById(modalId);
    
    // Tạo modal động nếu chưa tồn tại
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal'; 
        document.body.appendChild(modal);
    }

    // HTML cho Modal 2 lựa chọn
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 550px; text-align: center; border-radius: 8px;">
            <span class="close-button" onclick="document.getElementById('${modalId}').style.display='none'">&times;</span>
            <h2 style="margin-top: 0; color: #007bff; border-bottom: 2px solid #eee; padding-bottom: 15px;">Tuỳ chọn nhập dữ liệu thực hiện công việc</h2>
            <p style="margin: 20px 0; font-size: 16px; color: #495057;">Để ghi nhận <b>kết quả thực hiện Công việc</b>, hãy chọn cách nhập số liệu:</p>
            
            <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">
                <button class="btn-primary" style="padding: 15px; font-size: 16px; width: 100%; border-radius: 6px;" 
                        onclick="document.getElementById('${modalId}').style.display='none'; executeNormalMultiExecution(['${path}']);">
                    1. Ghi nhận tổng chi phí thực hiện cho công việc này
                </button>
                
                <button class="btn-success" style="padding: 15px; font-size: 16px; width: 100%; border-radius: 6px;" 
                        onclick="document.getElementById('${modalId}').style.display='none'; openCombinedAddModal('${path}');">
                    2. Kê khai các vật tư chi tiết để thực hiện công việc này
                </button>
            </div>
        </div>
    `;

    modal.style.display = 'block';
};

// =========================================================================
// 3. HÀM CHỨA LOGIC CŨ CỦA OPEN MULTI EXECUTION MODAL
// =========================================================================
window.executeNormalMultiExecution = function(selectedPathsArray) {
    // --- BẮT ĐẦU: LOGIC KIỂM TRA TASK CẤP 5 ĐÃ THỰC HIỆN ---
    for (const path of selectedPathsArray) {
        // 1. Chỉ kiểm tra Task Cấp 5 (greatGreatGrandchildren)
        if (path.includes('/greatGreatGrandchildren/')) {
            const taskData = docDataMap.get(path);
            
            // 2. Kiểm tra xem đã có dữ liệu thực hiện chưa
            if (taskData && taskData.executions && Object.keys(taskData.executions).length > 0) {
                alert("Trong số các công việc lựa chọn đã có công việc đã thực hiện rồi, không thể thực hiện tiếp. Hãy lựa chọn lại");
                return; 
            }
        }
    }
    // --- KẾT THÚC LOGIC KIỂM TRA ---

    // Lọc lấy các task lá (Leaf Tasks) để hiển thị lên bảng
    const leafTasks = selectedPathsArray.filter(path => {
        const taskData = docDataMap.get(path);
        if (!taskData) return false; 
        
        // Cấp 5 luôn là lá
        if (path.includes('/greatGreatGrandchildren/')) {
            return true;
        }
        // Cấp 4 là lá nếu không có con (hasChildren = false)
        if (path.includes('/greatGrandchildren/')) {
            return taskData.hasChildren !== true;
        }
        return false;
    });

    if (leafTasks.length === 0) {
        if (selectedPathsArray.length > 0) {
             alert("Bạn đã chọn công việc, nhưng không có mục nào là công việc 'lá' (công việc chi tiết cuối cùng) có thể thực hiện. Vui lòng chỉ chọn các công việc chi tiết.");
        } else {
            alert("Vui lòng chọn ít nhất một công việc 'lá' (công việc chi tiết cuối cùng) để thực hiện.");
        }
        return;
    }

    const title = `Nhập dữ liệu thực hiện cho ${leafTasks.length} công việc đã chọn`;
    document.getElementById('modalTitle').innerHTML = `<h2>${title}</h2>`;

    // Tạo Header cho bảng
    const headers = [ 
        {text: 'TT', width: '2%'}, 
        {text: 'Khu vực', width: '20%'}, 
        {text: 'Mục KH', width: '4%'},    
        {text: 'Công việc thực hiện', width: '25%'},   
        {text: 'Đ.vị tính', width: '4%'}, 
        {text: 'Số lượng', width: '5%'}, 
        {text: 'Đơn giá', width: '9%'}, 
        {text: 'Thành tiền', width: '9%'}
    ];

    let table = createModalTable(headers);
    
    leafTasks.forEach((path, index) => {
        const taskData = docDataMap.get(path);
        const taskTT = taskData ? convertTTForDisplay(taskData.tt) : '';
        const noiDung = taskData?.noiDung || '';
        const donVi = taskData?.donVi || '';
        const donGia = taskData?.donGia || 0;

        // Lấy thông tin Khu vực (Cấp 1)
        let khuVuc = 'Không xác định';
        const pathParts = path.split('/');
        if (pathParts.length > 1) {
            const parentId = pathParts[1]; 
            if (typeof parentNoiDungMap !== 'undefined') {
                khuVuc = parentNoiDungMap.get(parentId) || parentId;
            }
        }

        table += `<tr data-path="${path}">
            <td><input type="text" value="${index + 1}" disabled></td>
            <td><input type="text" value="${khuVuc}" disabled></td> 
            <td><input type="text" value="${taskTT}" disabled></td> 
            <td><input type="text" value="${noiDung}" disabled></td>
            <td><input type="text" value="${donVi}" disabled></td>
            <td><input type="number" step="any" value="" data-field="dvt" oninput="calculateThanhTien(this)" onfocus="this.select()"></td>
            <td><input type="number" value="${donGia}" data-field="donGia" oninput="calculateThanhTien(this)" onfocus="this.select()"></td>
            <td><input type="text" value="" data-field="thanhTien" disabled oninput="this.value=formatNumber(parseNumber(this.value))" onfocus="this.select()"></td> 
        </tr>`;
    });
    
    table += '</tbody></table>';
    const dateInput = `<div style="margin-top: 15px;"><label for="executionDate">Ngày thực hiện:</label><input type="date" id="executionDate" style="margin-left: 10px; padding: 8px;"></div>`;
    document.getElementById('modalBody').innerHTML = dateInput + table;
    document.getElementById('modalSaveButton').onclick = saveMultiExecutionData;
    document.getElementById('modalSaveButton').style.display = 'block';
    document.getElementById('modalDeleteButton').style.display = 'none';
    document.getElementById('modal-footer-left').innerHTML = '';
    document.getElementById('dataModal').style.display = 'block';
};

// =========================================================================
    // 3. HÀM CHUYỂN ĐỔI CHẾ ĐỘ (TRIGGER)
    // =========================================================================
    window.togglePlanningColumns = function(checked) {
        const taskList = document.getElementById('taskList');
        
        // 1. Cập nhật biến toàn cục
        if (typeof planningModeByYear !== 'undefined') {
            planningModeByYear[currentYear] = checked;
        }

        // 2. Thêm/Xóa class CSS (Class này kích hoạt CSS ẩn/hiện ở Phần 1)
        if (checked) {
            taskList.classList.add('planning-mode');
        } else {
            taskList.classList.remove('planning-mode');
        }

        // 3. Logic ẩn hiện nút Excel (cũ)
        const btnExcel1 = document.getElementById('exportExcel1Btn');
        const btnExcel2 = document.getElementById('exportExcel2Btn');
        if(btnExcel1) btnExcel1.disabled = checked;
        if(btnExcel2) btnExcel2.disabled = !checked;

        // 4. [QUAN TRỌNG] Gọi cập nhật trạng thái Sáng/Mờ ngay lập tức
        updateButtonStates();
    };    
	
	// =========================================================================
    // HÀM ẨN/HIỆN CÔNG VIỆC KHÔNG THỰC HIỆN TRONG NĂM
    // =========================================================================
    window.toggleZeroPlanTasks = function(isChecked) {
        const rows = document.querySelectorAll('#taskListBody tr');
        let hiddenL4Paths = new Set();

        // Bước 1: Quét tìm tất cả Level 4 thỏa mãn điều kiện tanSuat 0 chiPhi 0
        rows.forEach(row => {
            const path = row.dataset.path;
            if (!path) return;

            // Kiểm tra dòng có phải Level 4 không
            if (row.classList.contains('task-great-grandchild')) {
                const cpCell = row.querySelector('.col-chiphi');
                let cp = 0;
                if (cpCell) {
                    cp = parseFloat(cpCell.innerText.replace(/[^\d.-]/g, '')) || 0;
                }
                
                // --- ĐÃ CHỈNH SỬA: LOGIC LẤY TẦN SUẤT CHUẨN HÓA ---
                const tsCell = row.querySelector('.col-tansuat-th');
                let ts = 1; // Nguyên tắc 2: Không có gì thì mặc định là 1
                if (tsCell) {
                    const tsText = tsCell.innerText.trim();
                    if (tsText === '') {
                        ts = 1; // Trống -> 1
                    } else if (tsText === '-') {
                        ts = 0; // Gạch ngang -> 0
                    } else {
                        const parsed = parseFloat(tsText);
                        ts = isNaN(parsed) ? 0 : parsed; // Nguyên tắc 4: Không phải số hợp lệ -> 0
                    }
                }
                
                // Bây giờ mới xét đúng cả 2 điều kiện
                if (ts === 0 && cp === 0) {
                    hiddenL4Paths.add(path);
                }
            }
        });

        // Bước 2: Ẩn/hiện dòng Level 4 và toàn bộ các dòng cấp dưới của nó
        rows.forEach(row => {
            const path = row.dataset.path;
            if (!path) return;
            
            let shouldHide = false;
            for (const hPath of hiddenL4Paths) {
                if (path === hPath || path.startsWith(hPath + '/')) {
                    shouldHide = true;
                    break;
                }
            }
            
            if (shouldHide) {
                if (isChecked) {
                    row.classList.add('zero-plan-hidden-row');
                    row.style.display = 'none';
                } else {
                    row.classList.remove('zero-plan-hidden-row');
                    row.style.display = ''; // Khôi phục hiển thị
                }
            }
        });
    };

    // Tự động kích hoạt lại bộ lọc mỗi khi bảng được vẽ lại (ví dụ khi chuyển năm hoặc tính toán lại dữ liệu)
    window.addEventListener('DOMContentLoaded', () => {
        const tbody = document.getElementById('taskListBody');
        if (tbody) {
            const observer = new MutationObserver((mutations) => {
                const toggle = document.getElementById('hideZeroPlanToggle');
                if (toggle && toggle.checked) {
                    let hasNewRows = false;
                    for (let m of mutations) {
                        if (m.addedNodes.length > 0) {
                            hasNewRows = true; break;
                        }
                    }
                    if (hasNewRows) window.toggleZeroPlanTasks(true);
                }
            });
            observer.observe(tbody, { childList: true });
        }
    });

    window.changeYear = function(year) {
        currentYear = parseInt(year);
        fetchData();
        updateButtonStates();
        const toggle = document.getElementById('planningModeToggle');
        toggle.checked = planningModeByYear[currentYear] || false;
        if(!toggle.checked) {
             togglePlanningColumns(false);
        }
    };

    window.closeAllModals = function() {
        document.querySelectorAll('.modal').forEach(modal => modal.style.display = 'none');
        activeCharts.forEach(chart => chart.destroy());
        activeCharts = [];
        const toggleDiv = document.getElementById('editModeToggle');
        if (toggleDiv) {
            toggleDiv.style.display = 'none';
            document.getElementById('unlockButton').style.display = 'block';
        }
    };

    window.showLinks = function(event) {
        event.stopPropagation();
        const existingDropdown = document.getElementById('links-dropdown-container');
        if (existingDropdown) existingDropdown.remove();
        
        const button = event.target;
        const links = JSON.parse(button.dataset.links);
        if (!links || links.length === 0) return;

        const dropdown = document.createElement('div');
        dropdown.id = 'links-dropdown-container';
        dropdown.className = 'links-dropdown';

        links.forEach(link => {
            const a = document.createElement('a');
            a.href = link;
            a.textContent = link.length > 50 ? link.substring(0, 50) + '...' : link;
            a.target = '_blank';
            a.title = link;
            dropdown.appendChild(a);
        });

        document.body.appendChild(dropdown);
        
        const rect = button.getBoundingClientRect();
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        dropdown.style.top = `${rect.bottom + window.scrollY}px`;
    };

    /**
 * THAY THẾ HÀM importData() HIỆN TẠI BẰNG HÀM NÀY.
 *
 * Điều phối quy trình nhập Excel theo nguyên tắc "Hợp nhất thông minh" (Smart Merge):
 * 1. Đọc file Excel, lấy cả dữ liệu (jsonData) và danh sách cột (headers).
 * 2. Xây dựng gói dữ liệu "chỉ cập nhật" (buildImportUpdates_Merge).
 * 3. Hợp nhất (update) gói dữ liệu này vào CSDL mà không xóa.
 * 4. Kích hoạt quy trình tính toán & dọn dẹp (recalculateAllCostsAndReload).
 * 5. Tải lại giao diện.
 */
window.importData = function() {
    if (!isAuthenticated) return showAuthError();

    const fileInput = document.getElementById('excelFile');
    if (!fileInput.files.length) {
        statusDiv.className = 'error';
        statusDiv.innerText = "Vui lòng chọn một file Excel (.xlsx).";
        return;
    }

    // Thông báo về hành động Hợp nhất
    if (!confirm(`HÀNH ĐỘNG: HỢP NHẤT DỮ LIỆU.\n\nCác tác vụ trong file Excel sẽ được CẬP NHẬT vào CSDL.\nCác tác vụ không có trong file Excel sẽ được GIỮ NGUYÊN.\n\nCẢNH BÁO: Nếu file Excel có cột "Thành tiền" (thể hiện giá trị thực hiện công việc), dữ liệu thực hiện CŨ của các tác vụ đó sẽ bị GHI ĐÈ.\n\nBạn có muốn tiếp tục không?`)) {
        fileInput.value = ''; // Reset file input nếu hủy
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        const importButton = document.querySelector('#dataManagementModal .btn-primary[onclick="importData()"]');
        try {
            if(importButton) importButton.disabled = true; // Vô hiệu hóa nút nhập
            statusDiv.className = 'success';
            statusDiv.innerText = "Đang đọc file Excel...";

            const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // 1. Lấy danh sách cột gốc (Header)
            const headerJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
            const headers = headerJson.length > 0 ? headerJson[0].map(String) : []; 

            // 2. KỸ THUẬT ĐỌC KÉP (Dual Read)
            // Bản 1: Đọc dưới dạng Chuỗi hiển thị (Lấy Ngày tháng, Nội dung, TT chuẩn)
            const jsonDataString = XLSX.utils.sheet_to_json(worksheet, { header: headers, raw: false, defval: '' }).slice(1);
            
            // Bản 2: Đọc dưới dạng Giá trị nguyên thủy (Lấy con số 13000000 của Excel)
            const jsonDataRaw = XLSX.utils.sheet_to_json(worksheet, { header: headers, raw: true, defval: '' }).slice(1);

            // 3. TIỀN XỬ LÝ HỢP NHẤT (SMART MERGE)
            const numericKeywords = ['số lượng', 'so luong', 'đơn giá', 'don gia', 'chi phí', 'chi phi', 'thành tiền', 'thanh tien', 'năm trước', 'nam truoc', 'phân bổ', 'phan bo', 'năm pb', 'tần suất', 'tan suat'];
            const isNumericHeader = (header) => {
                const h = String(header).toLowerCase();
                return numericKeywords.some(kw => h.includes(kw));
            };

            const mergedData = jsonDataString.map((strRow, index) => {
                // ... (logic hợp nhất dữ liệu giữ nguyên) ...
                const rawRow = jsonDataRaw[index] || {};
                const mergedRow = {};
                for (const header of headers) {
                    if (isNumericHeader(header) && typeof rawRow[header] === 'number') {
                        mergedRow[header] = rawRow[header];
                    } else {
                        mergedRow[header] = strRow[header];
                    }
                }
                return mergedRow;
            });

            // =========================================================================
            // BƯỚC VALIDATE NGHIÊM NGẶT (ALL-OR-NOTHING) TRƯỚC KHI IMPORT
            // =========================================================================
            statusDiv.innerText = "Đang kiểm tra tính hợp lệ của toàn bộ file Excel...";
            
            // 1. Xác định đúng tên cột TT trong file Excel hiện tại
            const ttAliases = ['tt', 'thứ tự', 'thu tu'];
            let ttColumnName = null;
            for (const h of headers) {
                if (ttAliases.includes(String(h).toLowerCase().trim())) {
                    ttColumnName = h;
                    break;
                }
            }

            if (!ttColumnName) {
                alert("❌ LỖI NGHIÊM TRỌNG: Không tìm thấy cột 'TT' hoặc 'Thứ tự' trên dòng tiêu đề của file Excel!");
                statusDiv.className = 'error';
                statusDiv.innerText = "Lỗi: Không tìm thấy cột TT.";
                document.getElementById('importFile').value = ''; // Reset input file
                return; // Dừng hoàn toàn
            }

            // 2. Quét toàn bộ dữ liệu để tìm dòng thiếu TT
            let errorRows = [];
            mergedData.forEach((row, index) => {
                // Kiểm tra xem dòng có trống hoàn toàn không (Excel hay sinh ra các dòng rác ở cuối có định dạng nhưng ko có chữ)
                const isRowEmpty = Object.values(row).every(val => val === null || val === undefined || String(val).trim() === '');
                if (isRowEmpty) return; // Bỏ qua dòng trống

                const ttValue = String(row[ttColumnName] || '').trim();
                if (ttValue === '') {
                    // index bắt đầu từ 0. Dòng 1 trên Excel là dòng Tiêu đề (Header). 
                    // Do đó dòng dữ liệu đầu tiên (index 0) sẽ tương ứng với Dòng 2 trên Excel.
                    errorRows.push(index + 2); 
                }
            });

            // 3. Quyết định: Cấp phép đi tiếp hay Chặn đứng
            if (errorRows.length > 0) {
                alert(`❌ TỪ CHỐI NHẬP DỮ LIỆU!\n\nPhát hiện các dòng có chứa nội dung nhưng KHÔNG CÓ MÃ TT. Việc nhập dữ liệu thiếu TT sẽ làm hỏng cấu trúc cây công việc.\n\nVui lòng mở file Excel, bổ sung mã TT vào các dòng sau và tải lên lại:\n\n👉 Dòng số: ${errorRows.slice(0, 15).join(', ')}${errorRows.length > 15 ? ' ... và nhiều dòng khác.' : ''}`);
                
                statusDiv.className = 'error';
                statusDiv.innerText = `Đã hủy nhập liệu: Thiếu mã TT tại ${errorRows.length} dòng.`;
                document.getElementById('importFile').value = ''; // Reset input để người dùng có thể chọn lại chính file đó sau khi sửa
                return; // HALT EXECUTION - Chặn không cho API Firebase chạy
            }
            // =========================================================================
            // KẾT THÚC BƯỚC VALIDATE
            // =========================================================================


            statusDiv.className = 'info';
            statusDiv.innerText = "File hợp lệ. Đang tiến hành ghi dữ liệu vào hệ thống...";

            // Truyền Gói Dữ liệu Đã Hợp Nhất Hoàn Hảo (mergedData) vào hàm gốc của bạn
            const updates = buildImportUpdates_Merge(mergedData, headers);

            if (Object.keys(updates).length === 0) {
                 throw new Error("Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra định dạng cột TT (tiêu đề cột TT phải là chữ hoa, các mã hiệu phải đúng tiêu chuẩn) và nội dung bảng dữ liệu.");
            }

            // BƯỚC 2: Hợp nhất (Merge) dữ liệu vào CSDL
            statusDiv.innerText = "Đang hợp nhất dữ liệu vào CSDL...";
            // KHÔNG XÓA CSDL
            await update(ref(db), updates);

            // BƯỚC 3: Kích hoạt quy trình rà soát, tính toán và dọn dẹp
            statusDiv.innerText = "Hợp nhất thành công! Đang rà soát và tính toán lại toàn bộ dữ liệu...";
            await window.recalculateAllCostsAndReload(false); // false = không hiển thị confirm()

            statusDiv.innerText = "Hoàn tất! Đang tải lại giao diện...";
            closeAllModals();
            await fetchData(); // Tải lại giao diện với dữ liệu đã được tính toán

        } catch (error) {
            console.error("Lỗi khi nhập: ", error);
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi: ${error.message}`;
        } finally {
             if(importButton) importButton.disabled = false; // Kích hoạt lại nút nhập
             fileInput.value = ''; // Reset file input sau khi hoàn tất hoặc lỗi
        }
    };
     reader.onerror = (error) => {
         console.error("Lỗi đọc file:", error);
         statusDiv.className = 'error';
         statusDiv.innerText = 'Lỗi khi đọc file. Vui lòng thử lại.';
         fileInput.value = ''; // Reset file input
     };
    reader.readAsArrayBuffer(fileInput.files[0]);
};

    window.openDeleteAllDataModal = function() {
        if (!isAuthenticated) return showAuthError();
        document.getElementById('deleteAllDataModal').style.display = 'block';
        document.getElementById('deleteConfirmEmail').value = '';
        document.getElementById('deleteConfirmPassword').value = '';
    };

    window.confirmDeleteAllData = async function() {
        if (!isAuthenticated) return showAuthError();
        const email = document.getElementById('deleteConfirmEmail').value;
        const password = document.getElementById('deleteConfirmPassword').value;
        if (!email || !password) { alert('Vui lòng nhập đầy đủ email và mật khẩu.'); return; }
        const deleteButton = document.querySelector('#deleteAllDataModal .btn-danger');
        try {
            deleteButton.disabled = true;
            deleteButton.textContent = 'Đang xác nhận...';
            const credential = EmailAuthProvider.credential(email, password);
            await reauthenticateWithCredential(auth.currentUser, credential);
            statusDiv.className = 'success'; 
			statusDiv.innerText = "Đã xác thực thành công. Đang tiến hành xóa...";
            
            // 1. Xóa dữ liệu chi tiết (congViecMeYear)
            await set(ref(db, getParentCollectionName()), null);
            
            // 2. [BỔ SUNG] Xóa dữ liệu tổng hợp (summary_data/Year) để tránh rác CSDL
            await set(ref(db, `summary_data/${currentYear}`), null);
            
            statusDiv.innerText = "Đã xoá toàn bộ dữ liệu chi tiết và dữ liệu tổng hợp thành công.";
            closeAllModals();
            await fetchData();
        } catch (error) {
            console.error("Lỗi khi xoá: ", error);
            if (error.code === 'auth/invalid-credential') {
                alert('Email hoặc mật khẩu không chính xác. Thao tác xóa đã bị hủy.');
            } else {
                statusDiv.className = 'error';
                statusDiv.innerText = "Lỗi khi xoá: " + error.message;
            }
        } finally {
            deleteButton.disabled = false;
            deleteButton.textContent = 'Xác nhận xóa toàn bộ';
        }
    };

  window.promptForUnlock = async function() {
    const adminEmail = "admin@pvgaslpg.com.vn";
    const unlockBtn = document.getElementById('unlockButton');
    const originalText = "Mở khóa cho phép sửa đổi";
    const toggleDiv = document.getElementById('editModeToggle');
    const checkbox = document.getElementById('editModeCheckbox');
    
    // [MỚI] Các biến cho phần Khóa năm
    const lockSection = document.getElementById('lockYearSection');
    const lockCheckbox = document.getElementById('lockYearCheckbox');
    const lblLockYear = document.getElementById('lblLockYear');
    if(lblLockYear) lblLockYear.innerText = currentYear;
    const isYearLocked = lockedYears[currentYear] === true;
    const isEditEnabled = editModeStatusByYear[currentYear] === true;

    // 1. KIỂM TRA NẾU ĐÃ LÀ ADMIN
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.email === adminEmail) {
        statusDiv.className = 'success';
        statusDiv.innerText = "Đã nhận diện Admin.";

        unlockBtn.style.display = 'none';
        toggleDiv.style.display = 'block';
        checkbox.checked = isEditEnabled;
        
        // [MỚI] Hiển thị phần khóa năm ngay lập tức
        if(lockSection) lockSection.style.display = 'block';
        if(lockCheckbox) lockCheckbox.checked = isYearLocked;
        
        // Nếu đang khóa năm -> Vô hiệu hóa nút sửa đổi
        checkbox.disabled = isYearLocked;
        return;
    }

    // 2. NẾU CHƯA LÀ ADMIN -> HỎI MẬT KHẨU
    const password = prompt(`Nhập mật khẩu quản trị (${adminEmail}):`);
    if (password === null) return;

    try {
        unlockBtn.disabled = true;
        unlockBtn.textContent = "Đang xác thực...";

        await signInWithEmailAndPassword(auth, adminEmail, password);

        statusDiv.className = 'success';
        statusDiv.innerText = "Xác thực thành công.";
        
        unlockBtn.style.display = 'none';
        toggleDiv.style.display = 'block';
        checkbox.checked = isEditEnabled;

        // [MỚI] Hiển thị phần khóa năm NGAY SAU KHI ĐĂNG NHẬP THÀNH CÔNG
        if(lockSection) lockSection.style.display = 'block';
        if(lockCheckbox) lockCheckbox.checked = isYearLocked;
        checkbox.disabled = isYearLocked;

    } catch (error) {
        console.error(error);
        alert("Mật khẩu không chính xác hoặc lỗi kết nối.");
        statusDiv.className = 'error';
        statusDiv.innerText = "Lỗi xác thực.";
        unlockBtn.disabled = false;
        unlockBtn.textContent = originalText;
    }
};

    window.toggleEditMode = async function(isChecked) {
        if (!isAuthenticated) {
            // Nếu chưa đăng nhập, hoàn tác checkbox và báo lỗi
            document.getElementById('editModeCheckbox').checked = !isChecked;
            return showAuthError();
        }
        try {
            // === [CẢI TIẾN]: Update theo đường dẫn chi tiết để không ghi đè các năm khác ===
            const updates = {};
            // Chỉ định rõ đường dẫn sâu đến tận năm cần sửa
            updates[`settings/global/editModeStatus/${currentYear}`] = isChecked;

            // Gọi update trên root (ref(db)) với object updates chứa đường dẫn đầy đủ
            await update(ref(db), updates);
            
        } catch (error) {
            console.error("Lỗi khi cập nhật trạng thái mở khóa:", error);
            alert("Đã có lỗi xảy ra khi lưu trạng thái. Vui lòng thử lại.");
            // Hoàn tác checkbox nếu lỗi
            document.getElementById('editModeCheckbox').checked = !isChecked;
        }
    };


    window.saveMultiExecutionData = async function() {
        if (!isAuthenticated) return showAuthError();
        
        // --- LOGIC VALIDATE TÁCH RỜI TRƯỚC KHI XỬ LÝ LƯU ---
        const ngayThucHien = document.getElementById('executionDate').value;
        
        // 1. Kiểm tra rỗng (Đồng bộ dùng alert)
        if (!ngayThucHien) {
            alert("Vui lòng chọn ngày thực hiện.");
            return;
        }

        // 2. Kiểm tra giới hạn 15 ngày trong tương lai
        const selectedDate = new Date(ngayThucHien);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Đưa về 0h00 để so sánh tròn ngày
        const diffTime = selectedDate.getTime() - today.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        if (diffDays > 15) {
            alert("Không thể nhập ngày thực hiện quá 15 ngày trong tương lai");
            return;
        }
        // --------------------------------------------------

        const saveButton = document.getElementById('modalSaveButton');
        try {
            saveButton.disabled = true; saveButton.textContent = 'Đang lưu...';
            const updates = {};
            const rows = document.querySelectorAll("#dataModal .modal-table tbody tr");
            
            statusDiv.className = 'success'; statusDiv.innerText = "Đang lưu dữ liệu thực hiện...";
            const commonTimestamp = Date.now();
            const pathsToRecalculate = [];
            const childPathsToUpdate = new Set();

            for (const row of rows) {
                const leafNodePath = row.dataset.path;
                const leafNodeDocSnap = await get(ref(db, leafNodePath));
                if (!leafNodeDocSnap.exists()) continue;

                const pathParts = leafNodePath.split('/');
                const childPath = pathParts.slice(0, 4).join('/');
                childPathsToUpdate.add(childPath);

                const leafNodeData = leafNodeDocSnap.val();
                const initialChiPhi = leafNodeData.chiPhi || 0;
                const soLuong = parseNumber(row.querySelector('input[data-field="dvt"]').value);
                const thanhTien = parseFormattedNumber(row.querySelector('input[data-field="thanhTien"]').value);

                if (soLuong <= 0) continue; // Chỉ bỏ qua nếu không nhập số lượng

                pathsToRecalculate.push(leafNodePath);
                const executionCollectionRef = ref(db, `${leafNodePath}/executions`);
                const executionSnapshot = await get(executionCollectionRef);
                let lanThucHien = 1;
                if (executionSnapshot.exists()) {
                    // Lấy danh sách các ID đang tồn tại (chuyển về số nguyên)
                    const existingExecs = executionSnapshot.val();
                    const existingIds = new Set(Object.keys(existingExecs).map(k => parseInt(k, 10)));
                    
                    // Vòng lặp tìm số nhỏ nhất chưa có trong danh sách (Lấp chỗ trống)
                    while (existingIds.has(lanThucHien)) {
                        lanThucHien++;
                    }
                }
                const newExecutionData = {
                    dvt: soLuong,
                    donGia: parseNumber(row.querySelector('input[data-field="donGia"]').value),
                    thanhTien: thanhTien,
                    lanThucHien: lanThucHien,
                    ngayThucHien: ngayThucHien,
                    timestamp: commonTimestamp
                 };
                updates[`${leafNodePath}/executions/${lanThucHien}`] = newExecutionData;

                const currentThucHien = leafNodeData.chiPhiThucHien || 0;
                const newThucHien = currentThucHien + thanhTien;
                updates[`${leafNodePath}/chiPhiThucHien`] = newThucHien;
                updates[`${leafNodePath}/keHoachConLai`] = leafNodeData.chiPhi - newThucHien;
            }

            childPathsToUpdate.forEach(path => {
                updates[`${path}/daThucHien`] = true; // Đánh dấu nút cấp 2 là đã thực hiện
            });

            await update(ref(db), updates); // Ghi dữ liệu thực hiện và cập nhật chi phí lá, cờ daThucHien

            // Tính toán lại chi phí lan truyền lên các cấp cha
            await recalculateCostsForParents(pathsToRecalculate);

            // Kiểm tra lại trạng thái daThucHien cho các nút cấp 2 (đảm bảo đúng nếu có xóa execution trước đó)
            for (const childPath of childPathsToUpdate) {
                await checkAndUpdateDaThucHien(childPath);
            }

            // --- TÍNH TOÁN LẠI SUMMARY DATA NGAY LẬP TỨC ---
            await calculateSummaryData();
            // --- KẾT THÚC THÊM ---

            closeAllModals();
            await fetchData(); // Tải lại giao diện với dữ liệu mới nhất (bao gồm cả summary)
            statusDiv.innerText = `Đã lưu các mục thực hiện thành công.`;

        } catch (error) {
            console.error("Lỗi khi lưu thực hiện:", error);
            statusDiv.className = 'error'; statusDiv.innerText = `Lỗi khi lưu: ${error.message}`;
        } finally {
            saveButton.disabled = false; saveButton.textContent = 'Lưu thay đổi';
        }
    };

    // === BẮT ĐẦU ĐOẠN MÃ THAY THẾ ===
window.saveExecutionEdits = async function() {
    if (!isAuthenticated) return showAuthError();
    const saveButton = document.getElementById('modalSaveButton');
    try {
        saveButton.disabled = true;
        saveButton.textContent = 'Đang lưu...';
        const updates = {};
        const rows = document.querySelectorAll("#dataModal .modal-table tbody tr");
        const pathsToRecalculate = new Set();
        const childPathsToUpdate = new Set();

        for (const row of rows) {
            const execPath = row.dataset.execPath;
            const parentLeafNodePath = execPath.substring(0, execPath.lastIndexOf('/executions/'));
            const childPath = parentLeafNodePath.split('/').slice(0, 4).join('/');
            pathsToRecalculate.add(parentLeafNodePath);
            childPathsToUpdate.add(childPath);

            // SỬA LỖI: Cập nhật từng trường bằng đường dẫn đầy đủ để merge, không ghi đè
            updates[`${execPath}/dvt`] = parseNumber(row.querySelector('input[data-field="dvt"]').value);
            updates[`${execPath}/donGia`] = parseNumber(row.querySelector('input[data-field="donGia"]').value);
            updates[`${execPath}/thanhTien`] = parseFormattedNumber(row.querySelector('input[data-field="thanhTien"]').value);
        }

        // Đoạn code còn lại không cần thay đổi
        childPathsToUpdate.forEach(path => {
            updates[`${path}/daThucHien`] = true;
        });

        await update(ref(db), updates);

        const recalcPromises = Array.from(pathsToRecalculate).map(path => recalculateExecutionCost(path));
        await Promise.all(recalcPromises);

        for (const childPath of childPathsToUpdate) {
            await checkAndUpdateDaThucHien(childPath);
        }

        await recalculateCostsForParents(Array.from(pathsToRecalculate));

        closeAllModals();
        await fetchData(); // Tải lại dữ liệu để cập nhật giao diện
        statusDiv.className = 'success';
        statusDiv.innerText = "Đã cập nhật thành công lần thực hiện.";

    } catch (error) {
        console.error("Lỗi khi sửa thực hiện:", error);
        statusDiv.className = 'error';
        statusDiv.innerText = `Lỗi khi sửa: ${error.message}`;
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Lưu thay đổi';
    }
};


    

// === BẮT ĐẦU: HÀM MỚI ĐỂ THÊM DÒNG VÀO MODAL ===
    window.addNewRowToModal = function(parentPath, level) {
        const modalTableBody = document.querySelector("#dataModal .modal-table tbody");
        if (!modalTableBody || !modalTableBody.lastElementChild) {
            console.error("Không tìm thấy bảng modal hoặc dòng cuối cùng.");
            return;
        }

        const lastRow = modalTableBody.lastElementChild;
        const lastTTInput = lastRow.querySelector('input[data-field="tt"]');
        if (!lastTTInput) {
             console.error("Không tìm thấy trường TT ở dòng cuối.");
             return;
        }

        try {
            const lastDisplayTT = lastTTInput.value;
            const nextDisplayTT = incrementTT(lastDisplayTT); // Sử dụng helper
            const nextStorageTT = convertTTForStorage(nextDisplayTT); // Chuyển về dạng '1,1'

            const newData = { tt: nextStorageTT };
            
            // Sử dụng một path giả lập, vì createInputRow yêu cầu nó.
            // Hàm saveNewTasks sẽ bỏ qua path này và tự xây dựng path thật.
            const dummyPath = `new_item_${Date.now()}`; 
            
            // Gọi createInputRow để tạo HTML cho dòng mới
            const rowHtml = createInputRow(dummyPath, newData, level);

            // Chuyển chuỗi HTML thành một DOM element
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = `<table><tbody>${rowHtml}</tbody></table>`;
            const newTr = tempDiv.querySelector('tr');

            if (newTr) {
                // Thêm dòng mới vào bảng
                modalTableBody.appendChild(newTr);
                // Tự động focus vào ô nội dung của dòng mới
                newTr.querySelector('input[data-field="noiDung"]').focus();
            }
        } catch (e) {
            console.error("Lỗi khi thêm dòng mới vào modal:", e);
        }
    }
    // === KẾT THÚC: HÀM MỚI ĐỂ THÊM DÒNG VÀO MODAL ===

  
   
	
		
// =========================================================================
    // HÀM OPEN COMBINED ADD MODAL (CÓ NÚT EXCEL GÓC PHẢI)
    // =========================================================================
    window.openCombinedAddModal = async function(parentPath) {
        if (!isAuthenticated) return showAuthError();

        // 1. KIỂM TRA LOGIC (Giữ nguyên)
        try {
            const parentExecRef = ref(db, `${parentPath}/executions`);
            const parentExecSnap = await get(parentExecRef);
            if (parentExecSnap.exists() && parentExecSnap.size > 0) {
                alert("Đây là công việc đã có thực hiện, không thể thêm chi tiết. Vui lòng xoá thực hiện cũ trước.");
                return;
            }
        } catch (error) {
            console.error("Lỗi kiểm tra:", error);
            return;
        }

        const modal = document.getElementById('dataModal');
        const title = 'Kê khai các vật tư để thực hiện công việc';
        document.getElementById('modalTitle').innerHTML = `<h2>${title}</h2>`;

        const headers = [
            {text: 'TT', width: '5%'},
            {text: 'Nội dung công việc (Tên vật tư)', width: '30%'},
            {text: 'ĐVT', width: '10%'}, 
            {text: 'Số lượng', width: '10%'}, 
            {text: 'Đơn giá', width: '15%'}, 
            {text: 'Thành tiền', width: '15%'} 
        ];

        let table = createModalTable(headers);
        const newTT = await generateNextTT(parentPath, 'greatGreatGrandchild');
        const convertedNewTT = convertTTForStorage(newTT);
        const dummyPath = `new_combined_${Date.now()}`;
        
        table += createCombinedInputRow(dummyPath, convertedNewTT);
        table += '</tbody></table>';

        const dateInputHtml = `
            <div style="margin-bottom: 15px; background: #fff3cd; padding: 10px; border-radius: 5px; border: 1px solid #ffeeba;">
                <label for="combinedExecutionDate" style="font-weight: bold; color: #856404;">Ngày thực hiện công việc (*):</label>
                <input type="date" id="combinedExecutionDate" style="margin-left: 10px; padding: 5px; border: 1px solid #ccc; border-radius: 4px;">
                <span style="font-size: 0.9em; font-style: italic; margin-left: 10px;">(Bắt buộc chọn)</span>
            </div>
        `;

        // === THÊM INPUT FILE ẨN ĐỂ NHẬP EXCEL ===
        const hiddenFileInput = `<input type="file" id="combinedExcelInput" accept=".xlsx, .xls" style="display: none;" onchange="importCombinedModalData(this)">`;

        document.getElementById('modalBody').innerHTML = dateInputHtml + table + hiddenFileInput;
        
        document.getElementById('modalSaveButton').onclick = () => saveCombinedTasks(parentPath);
        
        // === CẤU HÌNH FOOTER: NÚT THÊM DÒNG (TRÁI) & NÚT EXCEL (PHẢI - CẠNH NÚT LƯU) ===
        document.getElementById('modal-footer-left').innerHTML = `
            <button class="btn-info" onclick="addCombinedRow('${parentPath}')" title="Thêm dòng mới">+ Thêm dòng</button>
        `;

        // Tạo nút Excel Dropdown chèn vào cạnh nút Lưu
        // Lưu ý: CSS inline 'bottom: 100%' để menu mở ngược lên trên, tránh bị che
        
        const excelBtnHtml = `
            <div class="dropdown" style="display: inline-block; margin-right: 20px;"> 
                <button class="dropbtn" onclick="toggleDropdown(event)" 
                        style="padding: 10px 18px; background-color: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Excel ▼
                </button>
                <div class="dropdown-content" style="bottom: 100%; top: auto; right: 0; min-width: 160px;">
                    <a href="javascript:void(0)" onclick="exportCombinedModalTemplate()">1. Xuất mẫu Excel</a>
                    <a href="javascript:void(0)" onclick="document.getElementById('combinedExcelInput').click()">2. Nhập từ Excel</a>
                </div>
            </div>
        `;
        // Hack nhẹ: Chèn nút Excel vào sau nút Save bằng JS (vì modal footer có cấu trúc cố định)
        // Hoặc ta có thể append vào modal-footer ngay lúc này
        const footer = document.querySelector('.modal-footer');
        // Xóa nút Excel cũ nếu có (tránh trùng lặp khi mở lại)
        const oldExcel = footer.querySelector('.excel-dropdown-container');
        if(oldExcel) oldExcel.remove();

        const excelContainer = document.createElement('div');
        excelContainer.className = 'excel-dropdown-container';
        excelContainer.style.display = 'inline-block';
        excelContainer.innerHTML = excelBtnHtml;
        
        // Chèn vào trước nút Lưu (modalSaveButton)
        const saveBtn = document.getElementById('modalSaveButton');
        footer.insertBefore(excelContainer, saveBtn);

        document.getElementById('modalSaveButton').style.display = 'inline-block';
        document.getElementById('modalDeleteButton').style.display = 'none';
        modal.style.display = 'block';

        setTimeout(() => {
            const firstInput = document.querySelector("#dataModal .modal-table tbody tr input[data-field='noiDung']");
            if(firstInput) firstInput.focus();
        }, 100);
    };

   // =========================================================================
    // HÀM TẠO DÒNG INPUT (NGUYÊN BẢN + THÊM SỰ KIỆN PASTE)
    // =========================================================================
    window.createCombinedInputRow = function(path, ttValue) {
        return `<tr data-path="${path}" class="combined-row">
            <td><input type="text" value="${convertTTForDisplay(ttValue)}" data-field="tt" disabled></td>
            
            <td><input type="text" placeholder="Nội dung..." data-field="noiDung" onpaste="handlePasteFromExcel(event)"></td>
            
            <td><input type="text" placeholder="ĐVT..." data-field="donVi" onpaste="handlePasteFromExcel(event)"></td>
            
            <td><input type="number" step="any" placeholder="SL..." data-field="dvt" oninput="calculateCombinedThanhTien(this)" onfocus="this.select()" onpaste="handlePasteFromExcel(event)"></td>
            
            <td><input type="number" placeholder="Đơn giá..." data-field="donGia" oninput="calculateCombinedThanhTien(this)" onfocus="this.select()" onpaste="handlePasteFromExcel(event)"></td>
            
            <td><input type="text" value="0" data-field="thanhTien" disabled></td>
        </tr>`;
    };

    // === HÀM MỚI: Thêm dòng mới vào Modal kết hợp ===
    window.addCombinedRow = function(parentPath) {
        const tbody = document.querySelector("#dataModal .modal-table tbody");
        const lastRow = tbody.lastElementChild;
        const lastTTInput = lastRow.querySelector('input[data-field="tt"]');
        
        let nextTT = '1';
        if (lastTTInput) {
            nextTT = incrementTT(lastTTInput.value);
        }
        
        const dummyPath = `new_combined_${Date.now()}`;
        const rowHtml = createCombinedInputRow(dummyPath, convertTTForStorage(nextTT));
        
        // Chèn HTML vào cuối bảng
        const temp = document.createElement('tbody');
        temp.innerHTML = rowHtml;
        const newRow = temp.firstElementChild;
        tbody.appendChild(newRow);
        
        newRow.querySelector('input[data-field="noiDung"]').focus();
    };

    // === HÀM MỚI: Tính thành tiền tự động trong Modal kết hợp ===
    window.calculateCombinedThanhTien = function(input) {
        const row = input.closest('tr');
        const slThucHien = parseNumber(row.querySelector('input[data-field="dvt"]').value);
        const donGia = parseNumber(row.querySelector('input[data-field="donGia"]').value);
        const thanhTienInput = row.querySelector('input[data-field="thanhTien"]');
        
        const total = slThucHien * donGia;
        thanhTienInput.value = formatNumber(total);
    };
	
	// =========================================================================
    // HÀM DÁN DỮ LIỆU EXCEL (PHIÊN BẢN FIX LỖI "CHỈ NHẬN 1 Ô")
    // =========================================================================
    window.handlePasteFromExcel = function(e) {
        // 1. Ngừng hành động dán mặc định
        e.preventDefault();

        // 2. Lấy dữ liệu Clipboard
        const clipboardData = (e.clipboardData || window.clipboardData).getData('text');
        if (!clipboardData) return;

        // 3. Phân tích dữ liệu (Tách dòng và cột)
        // Filter bỏ dòng trống cuối cùng do Excel hay tạo ra
        const rowsData = clipboardData.split(/\r\n|\n/).filter(row => row.length > 0).map(row => row.split('\t'));
        if (rowsData.length === 0) return;

        // 4. Xác định vị trí bắt đầu
        const targetInput = e.target;
        const targetRow = targetInput.closest('tr');
        const tableBody = targetRow.parentElement;
        
        // Lấy tất cả các dòng TR trong bảng (trừ dòng tiêu đề nếu có nằm trong tbody)
        const allRows = Array.from(tableBody.querySelectorAll('tr')); 
        const startRowIndex = allRows.indexOf(targetRow);

        // --- HÀM HELPER: Lấy danh sách input KHẢ DỤNG trong 1 dòng ---
        // Chỉ lấy input/textarea mà người dùng có thể nhìn thấy và nhập liệu
        const getEditableInputs = (tr) => {
            if (!tr) return [];
            return Array.from(tr.querySelectorAll('input, textarea')).filter(el => {
                return !el.disabled && 
                       el.type !== 'hidden' && 
                       el.type !== 'checkbox' && 
                       el.type !== 'radio' && 
                       el.style.display !== 'none';
            });
        };

        // Xác định: Ô đang paste là ô thứ mấy trong dòng đó?
        const currentInputs = getEditableInputs(targetRow);
        const startColIndex = currentInputs.indexOf(targetInput);

        if (startRowIndex === -1 || startColIndex === -1) {
            console.error("Không xác định được vị trí ô nhập liệu.");
            return;
        }

        // 5. Kiểm tra đủ dòng trống không
        const rowsNeeded = rowsData.length;
        const rowsAvailable = allRows.length - startRowIndex;

        if (rowsNeeded > rowsAvailable) {
            alert(`Thiếu dòng! Dữ liệu copy có ${rowsNeeded} dòng, nhưng chỉ còn ${rowsAvailable} dòng trống. Vui lòng thêm dòng trước.`);
            return;
        }

        // 6. Thực hiện dán
        rowsData.forEach((rowData, rIdx) => {
            // Xác định dòng đích trên web
            const currentRow = allRows[startRowIndex + rIdx];
            if (!currentRow) return;

            // Lấy danh sách các ô nhập liệu của dòng đích
            const rowInputs = getEditableInputs(currentRow);

            rowData.forEach((cellValue, cIdx) => {
                // Tính toán vị trí ô đích: Bắt đầu từ vị trí cột gốc + độ lệch
                const targetColIndex = startColIndex + cIdx;

                // Nếu ô đích tồn tại trong dòng web
                if (targetColIndex < rowInputs.length) {
                    const input = rowInputs[targetColIndex];
                    let val = cellValue.trim();

                    try {
                        // --- Xử lý làm sạch số liệu ---
                        // Nếu input là number hoặc các trường tiền tệ/số lượng -> chỉ giữ lại số và dấu chấm
                        const fieldName = input.getAttribute('data-field');
                        const isNumericField = input.type === 'number' || 
                                               ['chiPhi', 'khNamTruoc', 'thucHienNamTruoc', 'soLuong', 'donGia', 'dvt', 'tanSuatTH', 'namPhanBo'].includes(fieldName);

                        if (isNumericField) {
                            // Excel thường copy số dạng "10.000" (dấu chấm phân cách ngàn) -> Cần xóa dấu chấm đi để thành 10000
                            // Hoặc "10,5" (dấu phẩy thập phân) -> Cần đổi thành "10.5"
                            // Regex này giữ lại số (0-9) và dấu chấm (.), thay thế dấu phẩy (,) bằng chấm (.) nếu cần chuẩn hóa
                            // TUY NHIÊN: Cách an toàn nhất cho input type=number là chỉ lấy số.
                            val = val.replace(/[^0-9.]/g, ''); 
                        }

                        // Gán giá trị
                        input.value = val;

                        // --- Trigger các hàm tính toán ---
                        if (typeof calculateModalChiPhi === 'function') calculateModalChiPhi(input);
                        if (typeof calculateCombinedThanhTien === 'function') calculateCombinedThanhTien(input);
                        
                        // Format lại hiển thị (cho các trường tiền tệ text)
                        if (['chiPhi', 'khNamTruoc', 'thucHienNamTruoc', 'thanhTien'].includes(fieldName)) {
                             if(typeof formatNumber === 'function' && typeof parseNumber === 'function' && val !== '') {
                                 input.value = formatNumber(parseNumber(val));
                             }
                        }

                        // Dispatch event để đảm bảo các logic binding khác (nếu có) hoạt động
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));

                    } catch (err) {
                        console.error("Lỗi khi dán vào ô:", input, err);
                    }
                }
            });
        });
    };

    // === HÀM MỚI: Lưu dữ liệu kết hợp (Logic cốt lõi) ===
  
	window.saveCombinedTasks = async function(parentPath) {
        if (!isAuthenticated) return showAuthError();
        
        // --- LOGIC VALIDATE TÁCH RỜI TRƯỚC KHI XỬ LÝ LƯU ---
        const dateInput = document.getElementById('combinedExecutionDate');
        const ngayThucHien = dateInput.value;

        // 1. Kiểm tra rỗng
        if (!ngayThucHien) {
            alert("Vui lòng nhập Ngày thực hiện.");
            return;
        }

        // 2. Kiểm tra giới hạn 15 ngày trong tương lai
        const selectedDate = new Date(ngayThucHien);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Đưa về 0h00 để so sánh tròn ngày
        const diffTime = selectedDate.getTime() - today.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        if (diffDays > 15) {
            alert("Không thể nhập ngày thực hiện quá 15 ngày trong tương lai");
            return;
        }
        // --------------------------------------------------

        const saveButton = document.getElementById('modalSaveButton');
        try {
            saveButton.disabled = true; 
            saveButton.textContent = 'Đang lưu...';
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đang xử lý lưu kết hợp...';

            const updates = {};
            const rows = document.querySelectorAll("#dataModal .modal-table tbody tr");
            const pathsToRecalculate = new Set();
            const timestamp = Date.now(); 

            updates[`${parentPath}/hasChildren`] = true;
            const parentCleanUp = getCleanupFieldsForParentNode(parentPath);
            Object.assign(updates, parentCleanUp);
            
            updates[`${parentPath}/chiPhiThucHien`] = 0;
            updates[`${parentPath}/keHoachConLai`] = 0;

            for (const row of rows) {
                const tt = convertTTForStorage(row.querySelector('input[data-field="tt"]').value);
                const noiDung = row.querySelector('input[data-field="noiDung"]').value.trim();
                const donVi = row.querySelector('input[data-field="donVi"]').value.trim();
                const slThucHien = parseNumber(row.querySelector('input[data-field="dvt"]').value); 
                const soLuongPlan = slThucHien; 
                const donGia = parseFormattedNumber(row.querySelector('input[data-field="donGia"]').value);
                const thanhTien = slThucHien * donGia;

                if (!noiDung) continue; 

                const newTaskPath = `${parentPath}/greatGreatGrandchildren/${tt}`;
                
                const taskData = {
                    tt: tt,
                    noiDung: noiDung,
                    donVi: donVi,
                    soLuong: soLuongPlan,
                    donGia: donGia,
                    chiPhiThucHien: thanhTien,
                    daThucHien: true,
                    khNamTruoc: 0,
                    thucHienNamTruoc: 0,
                    tanSuatTH: 1,
                    tgBatDau: '',
                    tgHoanThanh: '',
                    ghiChu: '',
                    isHidden: false
                };

                if (slThucHien > 0 || thanhTien > 0) {
                    const executionData = {
                        ngayThucHien: ngayThucHien,
                        dvt: slThucHien,
                        donGia: donGia,
                        thanhTien: thanhTien,
                        lanThucHien: 1,
                        timestamp: timestamp
                    };
                    taskData.executions = { '1': executionData };
                }

                updates[newTaskPath] = taskData;
                pathsToRecalculate.add(newTaskPath);
            }

            await update(ref(db), updates);

            if (pathsToRecalculate.size > 0) {
                statusDiv.innerText = 'Đang tính toán lại chi phí cấp cha...';
                await recalculateCostsForParents(Array.from(pathsToRecalculate));
            }

            await calculateSummaryData();
            closeAllModals();
            await fetchData();
            
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đã thêm công việc và ghi nhận thực hiện thành công!';

        } catch (error) {
            console.error("Lỗi lưu kết hợp:", error);
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi: ${error.message}`;
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Lưu thay đổi';
        }
    };
	
 
// === KẾT THÚC hàm lưu kết hợp ===

   
    /**
     * Hàm xử lý Checkbox "Chọn tất cả" ở header bảng
     */
    window.toggleAllCheckboxes = function(headerCheckbox) {
        const isChecked = headerCheckbox.checked;
        const allCheckboxes = document.querySelectorAll('#taskListBody input[type="checkbox"]');
        
        // 1. Reset dữ liệu đã chọn để nạp lại từ đầu (tránh trùng lặp hoặc sót)
        if (!isChecked) {
            selectedTasks.clear();
            selectedJustifications.clear();
        }

        allCheckboxes.forEach(cb => {
            // Cập nhật trạng thái hiển thị
            cb.checked = isChecked;
            cb.indeterminate = false; // Quan trọng: Xóa trạng thái "bán phần" nếu có

            // Cập nhật dữ liệu vào Set
            const path = cb.dataset.path;
            if (isChecked) {
                if (cb.classList.contains('justification-checkbox')) {
                    selectedJustifications.add(path);
                } else {
                    selectedTasks.add(path);
                }
            }
        });

        updateButtonStates();
    };

    /**
     * Hàm Wrapper: Đảm bảo tính tương thích với HTML cũ
     * (Vì trong HTML có chỗ gọi toggleChildrenCheckboxes, có chỗ gọi toggleSelection)
     */
    window.toggleChildrenCheckboxes = function(parentCheckbox) {
        // Chuyển tiếp sang logic mới ở toggleSelection
        window.toggleSelection(parentCheckbox);
    };

    
   /**
     * Hàm xử lý chính: Chọn/Bỏ chọn task 
     * Hỗ trợ lan truyền xuống (Down) và cập nhật ngược lên (Up)
     */
    window.toggleSelection = function(checkbox, isFromCascade = false) {
        const path = checkbox.dataset.path;
        const isChecked = checkbox.checked;
        const isJustification = checkbox.classList.contains('justification-checkbox');

        // 1. Cập nhật vào danh sách đã chọn (Set)
        if (isChecked) {
            if (isJustification) selectedJustifications.add(path);
            else selectedTasks.add(path);
        } else {
            if (isJustification) selectedJustifications.delete(path);
            else selectedTasks.delete(path);
        }

        // 2. LAN TRUYỀN XUỐNG (Cascade Down): Chọn tất cả con cháu
        // Chỉ chạy khi người dùng click trực tiếp (isFromCascade = false)
        if (!isFromCascade) {
            const descendantCheckboxes = document.querySelectorAll(`input[type="checkbox"][data-path^="${path}/"]`);
            descendantCheckboxes.forEach(childCb => {
                if (childCb !== checkbox) {
                    childCb.checked = isChecked;
                    childCb.indeterminate = false; // Con cháu thì phải rõ ràng (Chọn/Không)
                    window.toggleSelection(childCb, true); // Gọi đệ quy nhẹ để cập nhật Set
                }
            });
        }

        // 3. CẬP NHẬT NGƯỢC LÊN (Bubble Up): Kiểm tra trạng thái cha/ông
        // Luôn chạy để đảm bảo tính nhất quán visual
        updateAncestors(path);

        // 4. Cập nhật nút bấm
        if (!isFromCascade) {
            updateButtonStates();
        }
    };

    /**
     * Hàm đệ quy cập nhật trạng thái visual của các cấp cha (Indeterminate)
     */
    function updateAncestors(currentPath) {
        // Tìm đường dẫn cha bằng cách cắt bỏ 2 phần cuối (VD: .../children/ID)
        // Regex: Tìm pattern "/[collection]/[id]" ở cuối chuỗi và loại bỏ nó
        const parentPathMatch = currentPath.match(/^(.*)\/[^\/]+\/[^\/]+$/);
        
        if (!parentPathMatch) return; // Đã đến root hoặc không tìm thấy cha

        const parentPath = parentPathMatch[1];
        const parentCheckbox = document.querySelector(`input[type="checkbox"][data-path="${parentPath}"]`);

        if (parentCheckbox) {
            // Tìm tất cả con TRỰC TIẾP của cha này để kiểm tra trạng thái
            // Logic: Tìm các checkbox có path bắt đầu bằng "parentPath/" 
            // Lưu ý: Cách này tìm cả cháu chắt, nhưng ta chỉ cần kiểm tra tổng thể
            const allDescendants = document.querySelectorAll(`input[type="checkbox"][data-path^="${parentPath}/"]`);
            
            let checkedCount = 0;
            let indeterminateCount = 0;
            const totalCount = allDescendants.length;

            allDescendants.forEach(cb => {
                if (cb.checked) checkedCount++;
                if (cb.indeterminate) indeterminateCount++;
            });

            if (checkedCount === totalCount && totalCount > 0) {
                // Tất cả con đều được chọn -> Cha chọn
                parentCheckbox.checked = true;
                parentCheckbox.indeterminate = false;
                // Cập nhật Set cho cha
                if(parentCheckbox.classList.contains('justification-checkbox')) selectedJustifications.add(parentPath);
                else selectedTasks.add(parentPath);

            } else if (checkedCount === 0 && indeterminateCount === 0) {
                // Không con nào được chọn -> Cha bỏ chọn
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = false;
                // Xóa Set cho cha
                if(parentCheckbox.classList.contains('justification-checkbox')) selectedJustifications.delete(parentPath);
                else selectedTasks.delete(parentPath);

            } else {
                // Trạng thái hỗn hợp -> Cha Indeterminate (dấu gạch ngang)
                // Lưu ý: Indeterminate về mặt logic dữ liệu thường coi là chưa chọn (checked = false)
                // hoặc tùy nghiệp vụ. Ở đây ta để checked = false để khi click vào nó sẽ thành true (chọn hết).
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = true;
                // Xóa Set cho cha (vì chưa chọn trọn vẹn)
                if(parentCheckbox.classList.contains('justification-checkbox')) selectedJustifications.delete(parentPath);
                else selectedTasks.delete(parentPath);
            }

            // Tiếp tục đệ quy lên cấp ông/cố
            updateAncestors(parentPath);
        }
    }

    window.scrollToTop = function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

  
// === BẮT ĐẦU KHỐI MÃ MỚI ĐỂ XUẤT EXCEL CÓ CÔNG THỨC ===

/**
 * HÀM PHỤ TRỢ 1: (ĐÃ SỬA LỖI)
 * Đệ quy "khô" qua toàn bộ dữ liệu để tìm số lần thực hiện tối đa.
 * Cần thiết để biết tạo bao nhiêu cột header.
 */
function findMaxExecutions(nodes) {
    let maxExec = 0;
    if (!nodes) return 0;

    const nodesArray = Array.isArray(nodes) ? nodes : Object.values(nodes);

    for (const node of nodesArray) {
        // === SỬA LỖI: THÊM KIỂM TRA "if (node)" ===
        // Bỏ qua các entry bị null hoặc undefined trong CSDL
        if (node) { 
            if (node.executions) {
                const execCount = Object.keys(node.executions).length;
                if (execCount > maxExec) maxExec = execCount;
            }
            
            // Đệ quy xuống các cấp con
            let childMax = 0;
            if (node.children) childMax = Math.max(childMax, findMaxExecutions(node.children));
            if (node.grandchildren) childMax = Math.max(childMax, findMaxExecutions(node.grandchildren));
            if (node.greatGrandchildren) childMax = Math.max(childMax, findMaxExecutions(node.greatGrandchildren));
            if (node.greatGreatGrandchildren) childMax = Math.max(childMax, findMaxExecutions(node.greatGreatGrandchildren));
            
            if (childMax > maxExec) maxExec = childMax;
        }
        // === KẾT THÚC SỬA LỖI ===
    }
    return maxExec;
}


/**
 * HÀM PHỤ TRỢ 2: (ĐÃ CẬP NHẬT: Thêm 'v:' cho các ô công thức)
 * Xử lý đệ quy các giải trình (Justifications) và ghi vào worksheet.
 * Trả về mảng các HÀNG (row index) của các giải trình con để SUM.
 */
function processJustificationForExcel(justificationNode, parentTT, level, ctx) {
    const r = ctx.currentRow;
    const isParentJustification = justificationNode.subJustifications && Object.keys(justificationNode.subJustifications).length > 0;
    let subJustificationRows = [];

    // Ghi dữ liệu giải trình cấp 1 (a, b, c...)
    ctx.ws[ctx.COLS.TT + r] = { t: 's', v: convertTTForDisplay(justificationNode.tt) };
    ctx.ws[ctx.COLS.NOI_DUNG + r] = { t: 's', v: justificationNode.noiDung || '' };
    
    const justStyle = { 
        font: { color: { rgb: "FF0000" }, italic: true },
        numFmt: ctx.moneyFormat 
    };
    
    if (isParentJustification) {
        const subJustifications = Object.keys(justificationNode.subJustifications)
            .map(subId => ({ id: subId, ...justificationNode.subJustifications[subId] }))
            .sort((a,b) => String(a.tt || '').localeCompare(String(b.tt || ''), undefined, { numeric: true, sensitivity: 'base' }));
        
        for (const subJustData of subJustifications) {
            ctx.currentRow++;
            const subJustChildRows = processJustificationForExcel(subJustData, justificationNode.tt, level + 1, ctx);
            subJustificationRows.push(...subJustChildRows);
        }
    }

    ctx.ws[ctx.COLS.DON_VI + r] = { t: 's', v: justificationNode.donVi || '', s: justStyle };
    
    if (!isParentJustification) {
        ctx.ws[ctx.COLS.SO_LUONG + r] = { t: 'n', v: justificationNode.soLuong || 0, s: justStyle };
        if (activeExportType === 'full' && ctx.COLS.DON_GIA) {
            ctx.ws[ctx.COLS.DON_GIA + r] = { t: 'n', v: justificationNode.donGia || 0, s: justStyle };
        }
    }
    
    // --- GHI CHI PHÍ ---
    const cellValue = justificationNode.chiPhi || 0; 

    if (isParentJustification && subJustificationRows.length > 0) {
        const sumCells = subJustificationRows.map(childR => ctx.COLS.CHI_PHI + childR).join(',');
        ctx.ws[ctx.COLS.CHI_PHI + r] = { t: 'n', v: cellValue, f: `SUM(${sumCells})`, s: justStyle };

    } else if (!isParentJustification && activeExportType === 'full' && ctx.COLS.DON_GIA) {
        const soLuongAddr = ctx.COLS.SO_LUONG + r;
        const donGiaAddr = ctx.COLS.DON_GIA + r; 
        ctx.ws[ctx.COLS.CHI_PHI + r] = { t: 'n', v: cellValue, f: `${soLuongAddr}*${donGiaAddr}`, s: justStyle };

    } else {
        ctx.ws[ctx.COLS.CHI_PHI + r] = { t: 'n', v: cellValue, s: justStyle };
    }
    
    // Xuất thêm dữ liệu cột Ghi chú cho giải trình
    if (ctx.COLS.GHI_CHU) {
        ctx.ws[ctx.COLS.GHI_CHU + r] = { t: 's', v: justificationNode.ghiChu || '', s: justStyle };
    }

    // --- QUAN TRỌNG: Để trống 2 cột Phân bổ cho dòng Giải trình ---
    // (Không cần ghi gì cả, ô sẽ tự động trống, nhưng đảm bảo không bị lệch cột sau này)

    // Thêm style
    ctx.ws[ctx.COLS.TT + r].s = justStyle;
    ctx.ws[ctx.COLS.NOI_DUNG + r].s = justStyle;
    if (ctx.ws[ctx.COLS.SO_LUONG + r]) ctx.ws[ctx.COLS.SO_LUONG + r].s = justStyle;
    if (activeExportType === 'full' && ctx.COLS.DON_GIA && ctx.ws[ctx.COLS.DON_GIA + r]) {
        ctx.ws[ctx.COLS.DON_GIA + r].s = justStyle;
    }
    
    return [r];
}



/**
 * HÀM MỚI: (Nút 3 - Sửa lỗi triệt để bằng cách TỰ TẠO TSV)
  */
	window.exportToClipboard = async function() {
    try {
        statusDiv.className = 'success';
        statusDiv.innerText = 'Đang chuẩn bị dữ liệu cho clipboard...';
        closeAllModals();

        // 1. Gọi hàm lõi để lấy dữ liệu
        const { ws } = await generateWorksheetWithFormulas();

        statusDiv.innerText = 'Đang chuyển đổi dữ liệu...';

        // 2. Tự xây dựng chuỗi TSV
        const tsvData = [];
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        // Xác định chỉ số cột TT
        const TT_COLUMN_INDEX = 0;
        
        // Hàm kiểm tra xem TT có cần xử lý đặc biệt không
        const needsSpecialHandling = (value) => {
            if (typeof value !== 'string') return false;
            
            // Kiểm tra xem có đúng 1 dấu chấm không
            const parts = value.split('.');
            if (parts.length !== 2) return false;
            
            // Kiểm tra cả hai phần đều là số
            if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return false;
            
            // Kiểm tra phần thập phân kết thúc bằng "0"
            return parts[1].endsWith('0');
        };

        for (let R = range.s.r; R <= range.e.r; ++R) {
            const row = [];
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                const cell = ws[cellAddress];

                if (!cell) {
                    row.push("");
                    continue;
                }

                // === XỬ LÝ ĐẶC BIỆT CHO CỘT TT ===
                if (C === TT_COLUMN_INDEX) {
                    if (cell.v !== undefined && cell.v !== null) {
                        let value = cell.v;
                        
                        // CHỈ xử lý các TT có dạng "1.10", "2.20"...
                        if (needsSpecialHandling(value)) {
                            // PHƯƠNG PHÁP 1: Thêm dấu cách không ngắt (non-breaking space)
                            // Ký tự này trông giống dấu cách nhưng Excel coi là văn bản
                            row.push('\u00A0' + value);
                        } else {
                            // Giữ nguyên các TT khác
                            row.push(String(value));
                        }
                    } else if (cell.f) {
                        row.push(`=${cell.f}`);
                    } else {
                        row.push("");
                    }
                    continue;
                }
                // === KẾT THÚC XỬ LÝ TT ===

                // Xử lý các cột khác
                if (cell.f) {
                    row.push(`=${cell.f}`);
                } else if (cell.v !== undefined && cell.v !== null) {
                    let value = cell.v;
                    
                    if (cell.t === 's' || typeof value === 'string') {
                        let str = String(value);
                        
                        // Escape các chuỗi đặc biệt
                        if (str.includes('"') || str.includes('\t') || str.includes('\n')) {
                            str = `"${str.replace(/"/g, '""')}"`;
                        }
                        row.push(str);
                    } else {
                        row.push(String(value));
                    }
                } else {
                    row.push("");
                }
            }
            tsvData.push(row.join('\t'));
        }
        
        const clipboardString = tsvData.join('\n');

        // 3. Sử dụng Clipboard API
        if (!navigator.clipboard) {
            throw new Error('Trình duyệt không hỗ trợ Clipboard API.');
        }

        // 4. Ghi vào clipboard
        await navigator.clipboard.writeText(clipboardString); 
        
        statusDiv.className = 'success';
        statusDiv.innerText = 'Đã sao chép dữ liệu vào Clipboard! Bạn có thể dán (Paste) vào Excel.';

    } catch (error) {
        console.error("Lỗi khi sao chép vào Clipboard:", error);
        statusDiv.className = 'error';
        statusDiv.innerText = `Lỗi sao chép: ${error.message}`;
    }
};

	window.openSummaryDetailModal = async function() {
        try {
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đang tải dữ liệu chi tiết...';

            const summaryRef = ref(db, `summary_data/${currentYear}`);
            const summarySnap = await get(summaryRef);

            if (!summarySnap.exists()) {
                throw new Error('Không tìm thấy dữ liệu tổng hợp. Vui lòng nhấn "Tải lại & Tính toán lại".');
            }
            const summaryData = summarySnap.val();

            const parentQuery = ref(db, getParentCollectionName());
            const parentSnapshot = await get(parentQuery);
            if (!parentSnapshot.exists()) {
                throw new Error('Không có dữ liệu cho năm này.');
            }

            const parentsData = parentSnapshot.val();
            const parents = Object.keys(parentsData).map(id => ({ id, ...parentsData[id] })).sort((a, b) => a.id.localeCompare(b.id));

            const modal = document.getElementById('summaryDetailModal');
            const contentContainer = document.getElementById('summaryDetailContent');
            document.getElementById('summaryDetailYear').textContent = currentYear;
            contentContainer.innerHTML = '';

            let htmlContent = '';
            for (const parent of parents) {
                const parentId = parent.id;
                const parentSummary = summaryData[parentId] || {};

                const name = parent.noiDung || 'Chưa có tên';
                const totalLeafNodes = parentSummary.totalLeafNodes || 0;
                const executedLeafNodes = parentSummary.totalExecutedLeafNodes || 0;
                const totalLeafNodesCap1 = parentSummary.totalLeafNodesCap1 || 0;
                const executedLeafNodesCap1 = parentSummary.totalExecutedLeafNodesCap1 || 0;

                // === BẮT ĐẦU SỬA LỖI ===
                // Lấy chi phí trực tiếp từ "công việc mẹ" (parent) thay vì từ summaryData
                const plannedCost = parent.chiPhi || 0;
                const executedCost = parent.chiPhiThucHien || 0;
                // === KẾT THÚC SỬA LỖI ===

                const leafPercentage = totalLeafNodes > 0 ? Math.round((executedLeafNodes / totalLeafNodes) * 100) : 0;
                const cap1Percentage = totalLeafNodesCap1 > 0 ? Math.round((executedLeafNodesCap1 / totalLeafNodesCap1) * 100) : 0;
                const costPercentage = plannedCost > 0 ? Math.round((executedCost / plannedCost) * 100) : 0;

                htmlContent += `
                    <div class="summary-parent-card">
                        <h3>${convertTTForDisplay(parentId)}. ${name}</h3>
                        <div class="summary-columns-container">
                            <div class="summary-info-column">
                                <h4>Kế hoạch</h4>
                                <p><strong>Số đầu việc KH:</strong> <span class="value">${totalLeafNodes}</span></p>
                                <p><strong>Số đầu việc cấp độ 1:</strong> <span class="value">${totalLeafNodesCap1}</span></p>
                                <p><strong>Chi phí KH:</strong> <span class="value">${formatNumber(plannedCost)}</span></p>
                            </div>
                            <div class="summary-info-column">
                                <h4>Thực hiện</h4>
                                <p><strong>Số đầu việc TH:</strong> <span class="value">${executedLeafNodes} <span class="percentage">(${leafPercentage}%)</span></span></p>
                                <p><strong>Số đầu việc cấp độ 1 TH:</strong> <span class="value">${executedLeafNodesCap1} <span class="percentage">(${cap1Percentage}%)</span></span></p>
                                <p><strong>Chi phí TH:</strong> <span class="value">${formatNumber(executedCost)} <span class="percentage">(${costPercentage}%)</span></span></p>
                            </div>
                        </div>
                        <div class="summary-charts-container">
                            <div class="chart-wrapper">
                                <canvas id="cap1Chart-${parentId}"></canvas>
                                <p>Tỷ lệ đầu việc cấp độ 1</p>
                            </div>
                            <div class="chart-wrapper">
                                <canvas id="costChart-${parentId}"></canvas>
                                <p>Tỷ lệ Chi phí</p>
                            </div>
                        </div>
                    </div>
                `;
            }

            contentContainer.innerHTML = htmlContent || '<p>Không có dữ liệu chi tiết để hiển thị.</p>';
            modal.style.display = 'block';

            activeCharts.forEach(chart => chart.destroy());
            activeCharts = [];

            for (const parent of parents) {
                const parentId = parent.id;
                const parentSummary = summaryData[parentId] || {};

                const totalLeafNodesCap1 = parentSummary.totalLeafNodesCap1 || 0;
                const executedLeafNodesCap1 = parentSummary.totalExecutedLeafNodesCap1 || 0;
                
                // === BẮT ĐẦU SỬA LỖI ===
                // Lấy chi phí trực tiếp từ "công việc mẹ" (parent) cho biểu đồ
                const plannedCost = parent.chiPhi || 0;
                const executedCost = parent.chiPhiThucHien || 0;
                // === KẾT THÚC SỬA LỖI ===

                const cap1Ctx = document.getElementById(`cap1Chart-${parentId}`).getContext('2d');
                const cap1Chart = new Chart(cap1Ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Đã thực hiện', 'Chưa thực hiện'],
                        datasets: [{
                            data: [executedLeafNodesCap1, totalLeafNodesCap1 - executedLeafNodesCap1],
                            backgroundColor: ['#28a745', '#e9ecef'],
                            borderColor: ['#28a745', '#e9ecef'],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.label || '';
                                        if (label) { label += ': '; }
                                        if (context.parsed !== null) {
                                            label += context.parsed + ' đầu việc';
                                        }
                                        return label;
                                    }
                                }
                            }
                        }
                    }
                });
                activeCharts.push(cap1Chart);

                const costCtx = document.getElementById(`costChart-${parentId}`).getContext('2d');
                 const costChart = new Chart(costCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Đã thực hiện', 'Còn lại'],
                        datasets: [{
                            data: [executedCost, plannedCost > executedCost ? plannedCost - executedCost : 0],
                            backgroundColor: ['#007bff', '#e9ecef'],
                            borderColor: ['#007bff', '#e9ecef'],
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.label || '';
                                        if (label) { label += ': '; }
                                        if (context.parsed !== null) {
                                            label += formatNumber(context.parsed);
                                        }
                                        return label;
                                    }
                                }
                            }
                        }
                    }
                });
                activeCharts.push(costChart);
            }

            statusDiv.innerText = '';
        } catch (error) {
            console.error("Lỗi khi mở modal chi tiết:", error);
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi: ${error.message}`;
        }
    };

    window.toggleDropdown = function(event) {
        event.stopPropagation();
        document.querySelectorAll(".dropdown-content").forEach(content => {
            if (content !== event.target.nextElementSibling) content.classList.remove('show');
        });
        event.target.nextElementSibling.classList.toggle("show");
    };

    window.onclick = function(event) {
        // ---------------------------------------------------------
        // 1. LOGIC MỚI: ĐÓNG MODAL KHI CLICK RA NGOÀI (OVERLAY)
        // ---------------------------------------------------------
        
        // Kiểm tra nếu click vào vùng nền tối (class 'modal')
        if (event.target.classList.contains('modal')) {
            // Trường hợp đặc biệt: Modal "Chế độ Kế hoạch" cần hàm đóng riêng để reset checkbox
            if (event.target.id === 'planningModeModal') {
                closePlanningModal();
            } else {
                // Các modal thông thường khác (Data, Upload, Settings...)
                closeAllModals();
            }
        }

        // Kiểm tra riêng cho Modal Đăng nhập (vì ID này không dùng class 'modal' chung)
        if (event.target.id === 'login-container') {
            closeLoginModal();
        }

        // ---------------------------------------------------------
        // 2. LOGIC CŨ: ĐÓNG DROPDOWN MENU
        // ---------------------------------------------------------
        if (!event.target.matches('.dropbtn')) {
            document.querySelectorAll(".dropdown-content").forEach(content => content.classList.remove('show'));
        }

        const linksDropdown = document.getElementById('links-dropdown-container');
        if (linksDropdown && !linksDropdown.contains(event.target) && !event.target.matches('[data-links]')) {
             linksDropdown.remove();
        }
    };

    // CÁC HÀM HỖ TRỢ KHÔNG CẦN GLOBAL
    function showAuthError() {
        statusDiv.className = 'error';
        statusDiv.innerText = 'Lỗi: Bạn cần xác thực để thực hiện hành động này. Vui lòng "Đăng nhập".';
        setTimeout(() => { if (statusDiv.innerText && statusDiv.innerText.includes('Bạn cần xác thực')) { statusDiv.innerText = ''; } }, 6000);
    }

  // =========================================================================
    // 2. HÀM CẬP NHẬT TRẠNG THÁI NÚT (ĐÃ FIX: XỬ LÝ CHỌN LAN TRUYỀN CHA-CON)
    // =========================================================================
    function updateButtonStates() {
        // 1. Lấy dữ liệu đầu vào
        const isYearLocked = lockedYears[currentYear] === true;
        const isEditModeOn = editModeStatusByYear[currentYear] === true;
        
        const taskListEl = document.getElementById('taskList');
        const isPlanning = taskListEl && taskListEl.classList.contains('planning-mode');

        // 2. LOGIC QUYỀN HẠN ACTION BUTTONS
        let enableActionButtons = false;
        if (isYearLocked) enableActionButtons = false;
        else {
            if (!isPlanning) enableActionButtons = true;
            else enableActionButtons = isEditModeOn;
        }

        // 3. ÁP DỤNG TRẠNG THÁI
        const actionElements = document.querySelectorAll(
            '#taskList .dropbtn, #taskList .btn-action:not(.btn-info), #taskList .dropdown-content a'
        );

        actionElements.forEach(el => {
            if (enableActionButtons) {
                el.classList.remove('disabled-btn'); 
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
                el.style.cursor = 'pointer';
                if(el.tagName === 'BUTTON') el.disabled = false;
            } else {
                el.style.opacity = '0.3'; 
                el.style.pointerEvents = 'none'; 
                el.style.cursor = 'not-allowed';
                if(el.tagName === 'BUTTON') el.disabled = true;
            }
        });

        // --- B. XỬ LÝ NÚT "XOÁ MỤC ĐÃ CHỌN" ---
        const deleteSelectedButton = document.getElementById('deleteSelectedBtn');
        if (deleteSelectedButton) {
            let canDelete = false;

            if (isAuthenticated && !isYearLocked) {
                const hasSelection = (selectedTasks.size > 0 || selectedJustifications.size > 0);

                if (isEditModeOn) {
                    // Chế độ Edit: Cho phép xóa tất cả
                    canDelete = hasSelection;
                } else {
                    // Chế độ Xem (EditMode = False): Chỉ cho phép xóa Level 5
                    
                    if (selectedTasks.size > 0 && selectedJustifications.size === 0) {
                        // Lọc danh sách thực tế cần kiểm tra
                        // Logic: Nếu 1 task được chọn mà nó có con (hoặc cháu) cũng đang được chọn
                        // thì ta coi như task cha đó chỉ là "vỏ bọc", không tính nó vào danh sách kiểm tra lỗi.
                        
                        const selectedArray = Array.from(selectedTasks);
                        
                        // Lọc ra những task "thực sự vi phạm" (tức là task không phải Level 5)
                        const invalidTasks = selectedArray.filter(path => {
                            // 1. Nếu nó là Level 5 -> Hợp lệ (Không vi phạm)
                            if (path.includes('/greatGreatGrandchildren/') || path.includes('greatGreatGrandchild')) {
                                return false; 
                            }
                            
                            // 2. Nếu nó KHÔNG phải Level 5 (VD: Level 4)
                            // Ta kiểm tra xem có Task con nào của nó đang được chọn không?
                            // Nếu có con đang được chọn -> Ta bỏ qua task cha này (coi như nó bị tích theo con)
                            const hasChildSelected = selectedArray.some(otherPath => 
                                otherPath !== path && otherPath.startsWith(path + '/')
                            );
                            
                            if (hasChildSelected) {
                                return false; // Bỏ qua, không tính là lỗi
                            }

                            // 3. Nếu nó là Level 4 mà KHÔNG có con nào được chọn 
                            // (tức là người dùng cố tình tích riêng Level 4 này) -> VI PHẠM
                            return true;
                        });

                        // Nếu danh sách vi phạm rỗng -> Có nghĩa là chỉ toàn Level 5 (hoặc cha của Level 5) được chọn
                        canDelete = (invalidTasks.length === 0);
                    }
                }
            }
            
            deleteSelectedButton.disabled = !canDelete;
            
            // Cập nhật Title
            if (deleteSelectedButton.disabled) {
                if (!isAuthenticated) deleteSelectedButton.title = "Vui lòng đăng nhập";
                else if (isYearLocked) deleteSelectedButton.title = "Năm đã bị khóa";
                else if (!isEditModeOn) deleteSelectedButton.title = "Vui lòng bật chế độ sửa đổi. Ở chế độ xem, bạn chỉ được phép xóa các mục chi tiết (Cấp 5).";
                else deleteSelectedButton.title = "Chưa chọn mục nào";
            } else {
                deleteSelectedButton.title = "Xoá các mục đã chọn";
            }
        }

        const multiExecuteButton = document.getElementById('multiExecuteBtn');
        if (multiExecuteButton) {
            multiExecuteButton.disabled = selectedTasks.size === 0 || !isAuthenticated || isYearLocked;
        }
        const moveSelectedButton = document.getElementById('moveSelectedBtn');
if (moveSelectedButton) {
    moveSelectedButton.disabled = selectedTasks.size === 0 || !isAuthenticated || isYearLocked || !isEditModeOn;
}
        const planningToggle = document.getElementById('planningModeToggle');
        if (planningToggle) planningToggle.disabled = false; 

        const editCheckbox = document.getElementById('editModeCheckbox');
        if(editCheckbox && document.getElementById('dataManagementModal').style.display === 'block') {
             editCheckbox.disabled = isYearLocked; 
        }
    } 

    const recalculateExecutionCost = async (leafNodePath) => {
        const execSnapshot = await get(ref(db, `${leafNodePath}/executions`));
        let newChiPhiThucHien = 0;
        let hasExecutions = false; // [THÊM MỚI] Biến cờ kiểm tra còn execution hay không

        if (execSnapshot.exists()) {
            const execData = execSnapshot.val();
            for (const execId in execData) {
                newChiPhiThucHien += (execData[execId].thanhTien || 0);
                hasExecutions = true; // [THÊM MỚI] Đánh dấu là vẫn còn thực hiện
            }
        }
        
        const leafNodeSnap = await get(ref(db, leafNodePath));
        if (leafNodeSnap.exists()) {
            const leafNodeData = leafNodeSnap.val();
            const chiPhi = leafNodeData.chiPhi || 0;
            
            // [THAY ĐỔI] Gói gọn các biến cập nhật và xét lại cờ daThucHien
            const updates = { 
                chiPhiThucHien: newChiPhiThucHien, 
                keHoachConLai: chiPhi - newChiPhiThucHien,
                daThucHien: hasExecutions ? true : null // Xóa cờ (set null) nếu không còn execution
            };
            
            await update(ref(db, leafNodePath), updates);
        }
    };

    const writeTreeToRealtimeDatabase = async (tree) => {
    const updates = {};

    const processNode = (node, path) => {
        // Thay đổi logic: cập nhật từng trường riêng lẻ thay vì cả đối tượng
        if (node.data && Object.keys(node.data).length > 1) {
            for (const key in node.data) {
                if (Object.prototype.hasOwnProperty.call(node.data, key)) {
                    // Tạo đường dẫn đầy đủ cho từng trường dữ liệu, ví dụ: .../A/noiDung
                    updates[`${path}/${key}`] = node.data[key];
                }
            }
        }

        if (node.justifications) {
            node.justifications.forEach(just => {
                const justPath = `${path}/justifications/${just.id}`;
                // Áp dụng logic tương tự cho các giải trình
                for (const key in just.data) {
                    if (Object.prototype.hasOwnProperty.call(just.data, key)) {
                        updates[`${justPath}/${key}`] = just.data[key];
                    }
                }
  // THÊM PHẦN NÀY: Xử lý giải trình cấp 2
                if (just.subJustifications) {
                    just.subJustifications.forEach(subJust => {
                        const subJustPath = `${justPath}/subJustifications/${subJust.id}`;
                        for (const key in subJust.data) {
                            if (Object.prototype.hasOwnProperty.call(subJust.data, key)) {
                                updates[`${subJustPath}/${key}`] = subJust.data[key];
                            }
                        }
                    });
                }
            });
        }



        // Các lời gọi đệ quy để xử lý các cấp con được giữ nguyên
        if (node.children) {
            node.children.forEach(child => processNode(child, `${path}/children/${child.id}`));
        }
        if (node.grandchildren) {
            node.grandchildren.forEach(grandchild => processNode(grandchild, `${path}/grandchildren/${grandchild.id}`));
        }
        if (node.greatGrandchildren) {
            node.greatGrandchildren.forEach(ggc => {
                const ggcPath = `${path}/greatGrandchildren/${ggc.id}`;
                processNode(ggc, ggcPath);

                if ((!ggc.greatGreatGrandchildren || ggc.greatGreatGrandchildren.length === 0) && ggc.executions && ggc.executions.length > 0) {
                    ggc.executions.forEach(exec => {
                        const execKey = push(child(ref(db), `${ggcPath}/executions`)).key;
                        updates[`${ggcPath}/executions/${execKey}`] = exec;
                    });
                }
            });
        }
        if (node.greatGreatGrandchildren) {
             node.greatGreatGrandchildren.forEach(gggc => {
                const gggcPath = `${path}/greatGreatGrandchildren/${gggc.id}`;
                processNode(gggc, gggcPath);
                if (gggc.executions && gggc.executions.length > 0) {
                    gggc.executions.forEach(exec => {
                        const execKey = push(child(ref(db), `${gggcPath}/executions`)).key;
                        updates[`${gggcPath}/executions/${execKey}`] = exec;
                    });
                }
            });
        }
    };

    tree.forEach(p => processNode(p, `${getParentCollectionName()}/${p.id}`));

    // Lệnh update cuối cùng không thay đổi, nhưng đối tượng 'updates' đã an toàn
    await update(ref(db), updates);
};

//    const formatNumber = (num) => num?.toLocaleString('vi-VN') || '0';

	const formatNumber = (num) => {
        if (num === null || num === undefined) return '0';
        // Hỗ trợ hiển thị tối đa 0 chữ số thập phân
        return Number(num).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
    };

// === BẮT ĐẦU: HÀM HELPER MỚI ĐỂ TĂNG TT ===
    function incrementTT(displayTT) {
        try {
            // Case: "*1", "*2" (Giải trình cấp 1)
            if (/^\*\d+$/.test(displayTT)) {
                const num = parseInt(displayTT.substring(1), 10);
                return `*${num + 1}`;
            }
            // Case: "*1.1", "*1.2" (Giải trình cấp 2)
            if (/^\*\d+\.\d+$/.test(displayTT)) {
                const parts = displayTT.split('.');
                const lastPart = parts.pop();
                const num = parseInt(lastPart, 10);
                if (!isNaN(num)) {
                    parts.push(num + 1);
                    return parts.join('.');
                }
            }
            // Case: "A.1", "1.1", "1.1.1" (Công việc dùng dấu chấm)
            if (displayTT.includes('.')) {
                const parts = displayTT.split('.');
                const lastPart = parts.pop();
                const num = parseInt(lastPart, 10);
                if (!isNaN(num)) {
                    parts.push(num + 1);
                    return parts.join('.');
                }
            }
            // Case: "1", "10" (Công việc cấp 3 - grandchild)
            const num = parseInt(displayTT, 10);
            if (!isNaN(num)) {
                return String(num + 1);
            }
        } catch (e) {
            console.error("Lỗi khi tăng TT:", displayTT, e);
        }
        // Fallback an toàn
        return displayTT + "+1";
    }
    // === KẾT THÚC: HÀM HELPER MỚI ĐỂ TĂNG TT ===

    
    const calculateCosts = (tree) => {
    tree.forEach(parent => {
        let parentChiPhi = 0, parentChiPhiThucHien = 0, parentKhNamTruoc = 0;
        (parent.children || []).forEach(child => {
            let childChiPhi = 0, childChiPhiThucHien = 0, childKhNamTruoc = 0;
            (child.grandchildren || []).forEach(grandchild => {
                let grandchildChiPhi = 0, grandchildChiPhiThucHien = 0, grandchildKhNamTruoc = 0;
                (grandchild.greatGrandchildren || []).forEach(ggc => {
                    if ((ggc.greatGreatGrandchildren || []).length > 0) {
                        ggc.data.hasChildren = true;
                        
                        // THÊM MỚI: Tính chi phí cho lá cấp 5 (ggggc) từ giải trình của nó
                        ggc.greatGreatGrandchildren.forEach(ggggc => {
                            // Tính tổng chi phí từ giải trình (cả cấp 1 và cấp 2) của lá cấp 5
                            let justificationChiPhi = 0;
                            if (ggggc.justifications && ggggc.justifications.length > 0) {
                                ggggc.justifications.forEach(just => {
                                    // NẾU CÓ GIẢI TRÌNH CẤP 2: tính tổng chi phí của các giải trình cấp 2
                                    if (just.subJustifications && just.subJustifications.length > 0) {
                                        justificationChiPhi += just.subJustifications.reduce(
                                            (sum, subJust) => sum + (subJust.data.chiPhi || 0), 0
                                        );
                                    } else {
                                        // NẾU KHÔNG CÓ GIẢI TRÌNH CẤP 2: lấy chi phí của giải trình cấp 1
                                        justificationChiPhi += just.data.chiPhi || 0;
                                    }
                                });
                                ggggc.data.chiPhi = justificationChiPhi; // Ghi đè chiPhi của lá cấp 5
                            }
                        });

                        const ggcChiPhi = ggc.greatGreatGrandchildren.reduce((s, gggc) => s + (gggc.data.chiPhi || 0), 0);
                        const ggcChiPhiThucHien = ggc.greatGreatGrandchildren.reduce((s, gggc) => s + (gggc.data.chiPhiThucHien || 0), 0);
                        const ggcKhNamTruoc = ggc.greatGreatGrandchildren.reduce((s, gggc) => s + (gggc.data.khNamTruoc || 0), 0);
                        ggc.data.chiPhi = ggcChiPhi;
                        ggc.data.chiPhiThucHien = ggcChiPhiThucHien;
                        ggc.data.khNamTruoc = ggcKhNamTruoc;
                    } else {
                        // Đây là lá cấp 4. Tính chi phí từ giải trình của nó (cả cấp 1 và cấp 2)
                        let justificationChiPhi = 0;
                        if (ggc.justifications && ggc.justifications.length > 0) {
                            ggc.justifications.forEach(just => {
                                // NẾU CÓ GIẢI TRÌNH CẤP 2: tính tổng chi phí của các giải trình cấp 2
                                if (just.subJustifications && just.subJustifications.length > 0) {
                                    justificationChiPhi += just.subJustifications.reduce(
                                        (sum, subJust) => sum + (subJust.data.chiPhi || 0), 0
                                    );
                                } else {
                                    // NẾU KHÔNG CÓ GIẢI TRÌNH CẤP 2: lấy chi phí của giải trình cấp 1
                                    justificationChiPhi += just.data.chiPhi || 0;
                                }
                            });
                            ggc.data.chiPhi = justificationChiPhi; // Ghi đè chiPhi của lá cấp 4
                        }
                        ggc.data.hasChildren = false;
                    }
                    if (ggc.data) {
                        ggc.data.keHoachConLai = (ggc.data.chiPhi || 0) - (ggc.data.chiPhiThucHien || 0);
                        grandchildChiPhi += ggc.data.chiPhi || 0;
                        grandchildChiPhiThucHien += ggc.data.chiPhiThucHien || 0;
                        grandchildKhNamTruoc += ggc.data.khNamTruoc || 0;
                    }
                });
                if (grandchild.data) {
                    grandchild.data.chiPhi = grandchildChiPhi;
                    grandchild.data.chiPhiThucHien = grandchildChiPhiThucHien;
                    grandchild.data.khNamTruoc = grandchildKhNamTruoc;
                    grandchild.data.keHoachConLai = grandchildChiPhi - grandchildChiPhiThucHien;
                }
                childChiPhi += grandchildChiPhi;
                childChiPhiThucHien += grandchildChiPhiThucHien;
                childKhNamTruoc += grandchildKhNamTruoc;
            });
            if (child.data) {
                child.data.chiPhi = childChiPhi;
                child.data.chiPhiThucHien = childChiPhiThucHien;
                child.data.khNamTruoc = childKhNamTruoc;
                child.data.keHoachConLai = childChiPhi - childChiPhiThucHien;
            }
            parentChiPhi += childChiPhi;
            parentChiPhiThucHien += childChiPhiThucHien;
            parentKhNamTruoc += childKhNamTruoc;
        });
        if (parent.data) {
            parent.data.chiPhi = parentChiPhi;
            parent.data.chiPhiThucHien = parentChiPhiThucHien;
            parent.data.khNamTruoc = parentKhNamTruoc;
            parent.data.keHoachConLai = parentChiPhi - parentChiPhiThucHien;
        }
    });
};

   const childSort = (a, b) => {
        // (CẬP NHẬT) a.id và b.id bây giờ chỉ là 'I', 'V', 'X'.
        // Không cần split hay so sánh parent.
        const numA = romanToNumber(a.id);
        const numB = romanToNumber(b.id);
        return numA - numB;
    };

    const numericSort = (a, b) => {
        const partsA = String(a.id).split(',').map(v => parseInt(v, 10));
        const partsB = String(b.id).split(',').map(v => parseInt(v, 10));
        const len = Math.max(partsA.length, partsB.length);
        for (let i = 0; i < len; i++) {
            const valA = partsA[i] || 0, valB = partsB[i] || 0;
            if (valA !== valB) return valA - valB;
        }
        return 0;
    };

    const createModalTable = (headers) => {
        let table = '<table class="modal-table"><thead><tr>';
        headers.forEach(h => {
            const style = h.width ? ` style="width: ${h.width};"` : '';
            const className = h.class ? ` class="${h.class}"` : '';
            const text = typeof h === 'object' ? h.text : h;
            table += `<th${style}${className}>${text}</th>`;
        });
        table += '</tr></thead><tbody>';
        return table;
    };



   const generateNextTT = async (parentPath, level) => {
        console.log(`[generateNextTT] Called for parentPath: ${parentPath}, level: ${level}`);
        const parentRef = ref(db, parentPath);
        const parentSnap = await get(parentRef);

        // Trường hợp cha không tồn tại hoặc khi thêm mục cấp 1 (A, B, C...)
        if (!parentSnap.exists()) {
            console.warn(`[generateNextTT] Parent snapshot not found at ${parentPath}.`);
            if (level === 'parent') {
                const rootSnapshot = await get(ref(db, getParentCollectionName()));
                let maxCharCode = 64; // Before 'A'
                if (rootSnapshot.exists()) {
                    const rootData = rootSnapshot.val();
                    for (const key in rootData) {
                        if (rootData[key]?.tt?.match(/^[A-Z]$/)) {
                            const charCode = rootData[key].tt.charCodeAt(0);
                            if (charCode > maxCharCode) maxCharCode = charCode;
                        }
                    }
                }
                const nextChar = String.fromCharCode(maxCharCode + 1);
                console.log(`[generateNextTT] Parent not found, level=parent. Returning: ${nextChar}`);
                return nextChar;
            } else {
                console.log(`[generateNextTT] Parent not found, level=${level}. Returning default '1'.`);
                return '1';
            }
        }

        // Nếu cha tồn tại
        let maxNumPart = 0; // Lưu phần SỐ lớn nhất hoặc mã ASCII lớn nhất
        const data = parentSnap.val();
        const parentTT = data.tt || ''; // TT của cha (Vd: 'A', 'A,1', '1', '1,1', 'a')
        console.log(`[generateNextTT] Parent TT found: ${parentTT}`);

        let subCollectionName;
        // Xác định collection con
        if (level === 'child') subCollectionName = 'children';
        else if (level === 'grandchild') subCollectionName = 'grandchildren';
        else if (level === 'greatGrandchild') subCollectionName = 'greatGrandchildren';
        else if (level === 'greatGreatGrandchild') subCollectionName = 'greatGreatGrandchildren';
        else if (level === 'justification') subCollectionName = 'justifications';
        else if (level === 'subJustification') subCollectionName = 'subJustifications';
        else {
             console.error(`[generateNextTT] Invalid level: ${level}`);
             return 'error_invalid_level';
        }

        const subCollection = data[subCollectionName] || {};
        console.log(`[generateNextTT] Checking subCollection "${subCollectionName}":`, subCollection); // DEBUG

        // Vòng lặp tìm phần số/ký tự lớn nhất (maxNumPart)
        for (const key in subCollection) {
            const currentItem = subCollection[key];
            if (!currentItem?.tt) continue; // Bỏ qua nếu không có tt

            const tt = currentItem.tt; // TT của item con đang xét (Vd: 'A,1', '1', '1.1', 'a', 'a1')
            console.log(`[generateNextTT]   Checking item TT: "${tt}"`); // DEBUG INSIDE LOOP

            try {
                let currentNum = NaN;
                let updateMax = false;

                if (level === 'justification') {
                    if (tt.startsWith('*')) {
                        currentNum = parseInt(tt.substring(1), 10);
                        updateMax = !isNaN(currentNum) && currentNum > maxNumPart;
                    }
                } else if (level === 'subJustification') {
                    if (tt.startsWith(parentTT + ',')) {
                        const numPartStr = tt.substring(parentTT.length + 1);
                        currentNum = parseInt(numPartStr, 10);
                        updateMax = !isNaN(currentNum) && currentNum > maxNumPart;
                    }
                } else if (level === 'child') {
                    // (CẬP NHẬT) tt bây giờ chỉ là 'I', 'V', 'X'. Không cần kiểm tra parentTT.
                    currentNum = romanToNumber(tt); 
                    updateMax = !isNaN(currentNum) && currentNum > 0 && currentNum > maxNumPart;
                } else if (level === 'grandchild') {
                    currentNum = parseInt(tt, 10); // Cấp 3 là số đơn giản
                    updateMax = !isNaN(currentNum) && currentNum > maxNumPart;
                } else if (level === 'greatGrandchild' || level === 'greatGreatGrandchild') {
                    // **SỬA LỖI LINH HOẠT DẤU PHÂN CÁCH**
                    let prefixFound = false;
                    let numPartStr = null;

                    // Kiểm tra tiền tố với dấu phẩy
                    if (tt.startsWith(parentTT + ',')) {
                         prefixFound = true;
                         numPartStr = tt.substring(parentTT.length + 1);
                         console.log(`[generateNextTT]     TT "${tt}" matches prefix with COMMA.`);
                    }
                    // Nếu không khớp dấu phẩy, kiểm tra tiền tố với dấu chấm
                    else if (tt.startsWith(parentTT + '.')) {
                         prefixFound = true;
                         numPartStr = tt.substring(parentTT.length + 1);
                         console.log(`[generateNextTT]     TT "${tt}" matches prefix with PERIOD.`);
                    }

                    if (prefixFound && numPartStr !== null) {
                        // Tách phần còn lại bằng cả dấu phẩy hoặc dấu chấm
                        const parts = numPartStr.split(/[,\.]/);
                        if (parts.length > 0) {
                            const firstNumStr = parts[0]; // Chỉ lấy số đầu tiên sau tiền tố cha
                            currentNum = parseInt(firstNumStr, 10);
                            updateMax = !isNaN(currentNum) && currentNum > maxNumPart;
                             console.log(`[generateNextTT]     Extracted first number part: "${firstNumStr}". Parsed num: ${currentNum}. Current max: ${maxNumPart}. Update max? ${updateMax}`);
                        } else {
                            console.log(`[generateNextTT]     Could not extract number part from "${numPartStr}".`);
                        }
                    } else if (!prefixFound) {
                        console.log(`[generateNextTT]     TT "${tt}" does NOT start with parentTT "${parentTT}" + separator. Skipping.`);
                    }
                }

                if (updateMax) {
                    console.log(`[generateNextTT]     Updating maxNumPart from ${maxNumPart} to ${currentNum}`); // DEBUG UPDATE
                    maxNumPart = currentNum;
                }

            } catch (parseError) {
                 console.error(`[generateNextTT]   Error parsing TT "${tt}"`, parseError);
            }
        } // End loop

        console.log(`[generateNextTT] Loop finished. Final maxNumPart: ${maxNumPart}`);

        // Tạo TT mới - **LUÔN DÙNG DẤU PHẨY CHO NHẤT QUÁN**
        let nextTT = 'error_generation_failed';
        if (level === 'justification') {
            nextTT = `*${maxNumPart + 1}`; // e.g., *1, *2
        } else if (level === 'subJustification') {
             nextTT = `${parentTT},${maxNumPart + 1}`; // e.g., *1,1
        } else if (level === 'child') {
            const nextRoman = numberToRoman(maxNumPart + 1); // Chuyển 1 -> 'I', 10 -> 'X'
            // (CẬP NHẬT) Mã hiệu mới chỉ là chữ số La Mã.
            nextTT = nextRoman; // e.g., I, II
        } else if (level === 'grandchild') {
            nextTT = String(maxNumPart + 1); // e.g., 1, 2
        } else if (level === 'greatGrandchild' || level === 'greatGreatGrandchild') {
             // **NHẤT QUÁN DÙNG DẤU PHẨY KHI TẠO MỚI**
            nextTT = `${parentTT},${maxNumPart + 1}`; // e.g., 6 -> 6,1 or 6,1 -> 6,1,1
        }

        console.log(`[generateNextTT] Calculated next TT: ${nextTT}`);
        return nextTT;
    };

    /**
     * Hàm nội bộ để bỏ chọn con (dùng cho nút "Chọn tất cả" ở đầu bảng)
     * Giữ nguyên dạng function cục bộ như mã nguồn gốc
     */
    function clearChildrenCheckboxes(parentCheckbox) {
        // Đảm bảo cha đã bỏ chọn trước khi gọi logic lan truyền
        if (parentCheckbox.checked) {
            parentCheckbox.checked = false;
        }
        // Tái sử dụng logic của toggleSelection để bỏ chọn toàn bộ con cháu
        window.toggleSelection(parentCheckbox);
    }

    window.onscroll = function() {
        const btn = document.getElementById("scrollToTopBtn");
        if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
            btn.style.display = "block";
        } else {
            btn.style.display = "none";
        }
    };

// Ensure checkAndUpdateDaThucHien is robust
     

   const recalculateCostsForParents = async (paths) => {
        const pathsToRecalculate = new Set();
        const pathsToCheckDaThucHien = new Set(); // Keep track of child paths for 'daThucHien' check

        // 1. Gather all unique ancestor paths
        for (const path of paths) {
            let currentPath = path;
            while (currentPath.includes('/')) {
                const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
                // Ensure we don't add collection names like 'children', 'grandchildren' etc.
                if (parentPath.split('/').length > 1 && !['children', 'grandchildren', 'greatGrandchildren', 'greatGreatGrandchildren'].includes(parentPath.substring(parentPath.lastIndexOf('/') + 1))) {
                    pathsToRecalculate.add(parentPath);
                     // If it's a direct child of the root (e.g., congViecMeYYYY/A/children/A,1), add for 'daThucHien' check
                     if (parentPath.split('/').length === 4 && parentPath.includes('/children/')) {
                         pathsToCheckDaThucHien.add(parentPath);
                     }
                }
                 // If the original path was a direct child, add it for checking 'daThucHien' status
                 if (path.split('/').length === 4 && path.includes('/children/')) {
                      pathsToCheckDaThucHien.add(path);
                 }

                currentPath = parentPath;
            }
        }

        // 2. Sort paths by depth (deepest first) to ensure bottom-up calculation
        const sortedPaths = Array.from(pathsToRecalculate).sort((a, b) => {
            const depthA = a.split('/').length;
            const depthB = b.split('/').length;
            return depthB - depthA; // Sort descending by depth
        });

        // 3. Recalculate sequentially from deepest to shallowest
        for (const path of sortedPaths) {
            // Determine the correct children field based on the path structure
            let childrenField = null;
            if (path.includes('/greatGrandchildren/')) childrenField = 'greatGreatGrandchildren';
            else if (path.includes('/grandchildren/')) childrenField = 'greatGrandchildren';
            else if (path.includes('/children/')) childrenField = 'grandchildren';
            else if (path.startsWith('congViecMe')) childrenField = 'children'; // Root level

            await recalculateSingleParentCost(path, childrenField); // Pass the determined children field
        }

        // 4. Update 'daThucHien' status for relevant child nodes after costs are updated
        for (const childPath of pathsToCheckDaThucHien) {
             // Check based on the direct children first (grandchildren level)
             const childSnap = await get(ref(db, childPath));
             if (childSnap.exists() && childSnap.val().grandchildren) {
                await checkAndUpdateDaThucHien(childPath);
             } else {
                 // If no grandchildren, check if the child itself has executions (shouldn't happen with current structure, but safe check)
                  const execSnapshot = await get(ref(db, `${childPath}/executions`));
                  await update(ref(db), { [`${childPath}/daThucHien`]: execSnapshot.exists() && Object.keys(execSnapshot.val()).length > 0 });
             }

        }
    };
// === HÀM ĐÃ SỬA: CHẶN CỘNG DỒN CHI PHÍ TỪ LEVEL 5 LÊN LEVEL 4 ===
	const recalculateSingleParentCost = async (parentPath, childrenField = null, fieldsToRecalculate = ['chiPhi', 'chiPhiThucHien', 'keHoachConLai', 'khNamTruoc', 'thucHienNamTruoc', 'chiPhiPhanBo', 'cpCap1']) => {
    const parentRef = ref(db, parentPath);
    const parentSnap = await get(parentRef);
    if (!parentSnap.exists()) return;

    const parentData = parentSnap.val();
    let isLeafNode = false;
    let childrenData = {};

    const pathSegments = parentPath.split('/');
    const nodeLevelName = pathSegments[pathSegments.length - 2]; 

    if (nodeLevelName === 'greatGreatGrandchildren') isLeafNode = true;
    else if (nodeLevelName === 'greatGrandchildren' && parentData.hasChildren !== true) isLeafNode = true;
    else {
        if (childrenField && parentData[childrenField]) childrenData = parentData[childrenField];
    }

    // Chỉ chặn cộng dồn chi phí Kế hoạch từ Cấp 5 lên Cấp 4. 
// Cho phép cộng dồn từ Cấp 4 (greatGrandchildren) lên Cấp 3.
if (childrenField === 'greatGreatGrandchildren') {
    fieldsToRecalculate = fieldsToRecalculate.filter(field => field !== 'chiPhi');
}

    const updates = {};
    let shouldUpdate = false;

    if (isLeafNode) {
        if (!parentPath.includes('greatGreatGrandchildren')) {
             const capDo = String(parentData.capDo || '1').trim();
             let newCpCap1 = 0;
             if (capDo === '1') newCpCap1 = parentData.chiPhi || 0;
             else if (capDo === '6t') newCpCap1 = (parentData.chiPhi || 0) * 0.5;
             
             if (parentData.cpCap1 !== newCpCap1) {
                 updates[`${parentPath}/cpCap1`] = newCpCap1;
                 shouldUpdate = true;
             }
        }
        
        const currentChiPhi = parentData.chiPhi || 0;
        const currentChiPhiThucHien = parentData.chiPhiThucHien || 0;
        
        // [LOGIC MỚI]: Cập nhật trạng thái quá hạn khi Sửa/Xóa/Thêm thực hiện
        if (nodeLevelName === 'greatGrandchildren') {
            const isOverdue = window.checkOverdueStatus(parentData, parseInt(currentYear));
            if (parentData.quaHan !== isOverdue) {
                updates[`${parentPath}/quaHan`] = isOverdue;
                shouldUpdate = true;
            }
        }

        // [LOGIC PS]
        const currentCapDo = String(parentData.capDo || '').trim().toLowerCase();
        const isPs = currentCapDo === 'ps';
        const newKeHoachConLai = isPs ? 0 : (currentChiPhi - currentChiPhiThucHien);

        if (parentData.keHoachConLai !== newKeHoachConLai) {
            updates[`${parentPath}/keHoachConLai`] = newKeHoachConLai;
            shouldUpdate = true;
        }
        const nam = parentData.namPhanBo || 0;
        const newCpPb = (nam > 0) ? Math.round(currentChiPhi / nam) : 0;
        if (parentData.chiPhiPhanBo !== newCpPb) {
            updates[`${parentPath}/chiPhiPhanBo`] = newCpPb;
            shouldUpdate = true;
        }

    } else {
        const total = { 
            chiPhi: 0, chiPhiThucHien: 0, khNamTruoc: 0, 
            thucHienNamTruoc: 0, chiPhiPhanBo: 0, cpCap1: 0 
        };

        if (typeof childrenData === 'object' && childrenData !== null) {
            for (const childId in childrenData) {
                if (typeof childrenData[childId] === 'object' && childrenData[childId] !== null) {
                    const child = childrenData[childId];
                    total.chiPhi += child.chiPhi || 0;
                    total.chiPhiThucHien += child.chiPhiThucHien || 0;
                    total.khNamTruoc += child.khNamTruoc || 0;
                    total.thucHienNamTruoc += child.thucHienNamTruoc || 0;
                    total.chiPhiPhanBo += (parseFloat(child.chiPhiPhanBo) || 0);
                    total.cpCap1 += (child.cpCap1 || 0);
                }
            }
        }
        
        if (childrenField === 'greatGreatGrandchildren') {
             const capDo = String(parentData.capDo || '1').trim();
             const selfChiPhi = parentData.chiPhi || 0; 
             if (capDo === '1') total.cpCap1 = selfChiPhi;
             else if (capDo === '6t') total.cpCap1 = selfChiPhi * 0.5;
             else total.cpCap1 = 0;
        }

        fieldsToRecalculate.forEach(field => {
            if (field === 'keHoachConLai') return;
            if (parentData[field] !== total[field]) {
                updates[`${parentPath}/${field}`] = total[field];
                shouldUpdate = true;
            }
        });

        // [LOGIC PS] Kiểm tra CapDo của chính node cha
        const newChiPhi = updates[`${parentPath}/chiPhi`] !== undefined ? updates[`${parentPath}/chiPhi`] : (parentData.chiPhi || 0);
        const newChiPhiThucHien = updates[`${parentPath}/chiPhiThucHien`] !== undefined ? updates[`${parentPath}/chiPhiThucHien`] : (parentData.chiPhiThucHien || 0);
        
        let currentCapDo = updates[`${parentPath}/capDo`];
        if (currentCapDo === undefined) currentCapDo = parentData.capDo;
        const isPs = String(currentCapDo || '').trim().toLowerCase() === 'ps';

        const newKeHoachConLai = isPs ? 0 : (newChiPhi - newChiPhiThucHien);

        if (parentData.keHoachConLai !== newKeHoachConLai) {
            updates[`${parentPath}/keHoachConLai`] = newKeHoachConLai;
            shouldUpdate = true;
        }
    }

    if (shouldUpdate) await update(ref(db), updates);
};
    // kết thúc 


    const recalculateCostsAfterJustificationChange = async (leafNodePaths) => {
    console.log("Entering recalculateCostsAfterJustificationChange with:", leafNodePaths);

    const pathsToProcess = Array.isArray(leafNodePaths) ? leafNodePaths : [leafNodePaths];
    if (pathsToProcess.length === 0) {
         console.log("No paths to process in recalculateCostsAfterJustificationChange. Exiting.");
         return;
    }

    const pathsForParentRecalc = new Set();

    try {
        for (const leafNodePath of pathsToProcess) {
            console.log(`Processing justification parent task: ${leafNodePath}`);
            pathsForParentRecalc.add(leafNodePath);

            const justSnapshot = await get(ref(db, `${leafNodePath}/justifications`));
            const leafNodeSnap = await get(ref(db, leafNodePath)); // Lấy dữ liệu nút lá hiện tại

            let calculatedTotalChiPhiForLeaf = 0; // Tổng chi phí TÍNH TOÁN ĐƯỢC từ giải trình
            const updatesForThisLeaf = {}; // Các cập nhật cần thực hiện cho nút lá và giải trình con
            let leafChiPhiNeedsUpdate = false; // Cờ báo hiệu chiPhi của nút lá có cần cập nhật không

            if (leafNodeSnap.exists()) {
                const leafNodeData = leafNodeSnap.val();
                let currentLeafChiPhi = leafNodeData.chiPhi || 0; // Lấy chiPhi hiện tại của nút lá

                if (justSnapshot.exists()) {
                    // --- CHỈ THỰC HIỆN KHI CÓ GIẢI TRÌNH ---
                    leafChiPhiNeedsUpdate = true; // Đánh dấu cần cập nhật chiPhi của lá
                    const justificationsData = justSnapshot.val();

                    // Duyệt qua giải trình Cấp 1 (a, b, c...)
                    for (const justId in justificationsData) {
                        const justificationL1 = justificationsData[justId];
                        const justificationL1Path = `${leafNodePath}/justifications/${justId}`;
                        let costForThisL1 = 0;

                        if (justificationL1.hasSubJustifications === true && justificationL1.subJustifications) {
                            let totalSubCost = 0;
                            for (const subId in justificationL1.subJustifications) {
                                totalSubCost += justificationL1.subJustifications[subId].chiPhi || 0;
                            }
                            costForThisL1 = totalSubCost;

                            if (justificationL1.chiPhi !== costForThisL1) {
                                console.log(`Updating L1 justification chiPhi at ${justificationL1Path} to ${costForThisL1}`);
                                updatesForThisLeaf[`${justificationL1Path}/chiPhi`] = costForThisL1;
                            }
                        } else {
                            costForThisL1 = justificationL1.chiPhi || 0;
                        }
                        calculatedTotalChiPhiForLeaf += costForThisL1;
                    } // Kết thúc duyệt giải trình Cấp 1

                    // Cập nhật chiPhi của nút lá BẰNG tổng chi phí giải trình
                    console.log(`Updating chiPhi for leaf task ${leafNodePath} FROM justifications to ${calculatedTotalChiPhiForLeaf}`);
                    updatesForThisLeaf[`${leafNodePath}/chiPhi`] = calculatedTotalChiPhiForLeaf;
                    currentLeafChiPhi = calculatedTotalChiPhiForLeaf; // Cập nhật giá trị để tính keHoachConLai

                } else {
                    // --- KHÔNG CÓ GIẢI TRÌNH ---
                     console.log(`No justifications found for leaf task ${leafNodePath}. chiPhi remains ${currentLeafChiPhi}.`);
                     // Không cập nhật chiPhi, giữ nguyên giá trị hiện có (currentLeafChiPhi)
                     // leafChiPhiNeedsUpdate vẫn là false
                }

                // Luôn tính lại KẾ HOẠCH CÒN LẠI dựa trên chiPhi (dù được cập nhật hay giữ nguyên)
                const chiPhiThucHien = leafNodeData.chiPhiThucHien || 0;
                const newKeHoachConLai = currentLeafChiPhi - chiPhiThucHien;
                 if (leafNodeData.keHoachConLai !== newKeHoachConLai || updatesForThisLeaf[`${leafNodePath}/chiPhi`] !== undefined) {
                      // Cập nhật keHoachConLai nếu nó thay đổi HOẶC nếu chiPhi đã thay đổi
                      updatesForThisLeaf[`${leafNodePath}/keHoachConLai`] = newKeHoachConLai;
                      console.log(`Updating keHoachConLai for leaf task ${leafNodePath} to ${newKeHoachConLai}`);
                 }

            } else {
                 console.warn(`Leaf node ${leafNodePath} not found during justification recalc.`);
            }


            // Ghi tất cả các thay đổi (chỉ ghi nếu updatesForThisLeaf không rỗng)
            if (Object.keys(updatesForThisLeaf).length > 0) {
                console.log(`Applying updates for ${leafNodePath}:`, updatesForThisLeaf);
                await update(ref(db), updatesForThisLeaf);
                console.log(`Firebase update successful for justifications under ${leafNodePath}`);
            } else {
                 console.log(`No updates needed for ${leafNodePath} or its justifications.`);
            }

        } // Kết thúc vòng lặp qua pathsToProcess

        // Gọi lan truyền lên cha
        const finalPathsArray = Array.from(pathsForParentRecalc);
        if (finalPathsArray.length > 0) {
             console.log("Calling recalculateCostsForParents with paths:", finalPathsArray);
             await recalculateCostsForParents(finalPathsArray);
             console.log("recalculateCostsForParents finished successfully inside recalculateCostsAfterJustificationChange.");
        } else {
            console.log("No paths require parent recalculation from justifications.");
        }

    } catch (innerError) {
         console.error(`Error INSIDE recalculateCostsAfterJustificationChange processing paths ${leafNodePaths}:`, innerError);
         throw innerError; // Ném lỗi ra ngoài
    }
    console.log("Exiting recalculateCostsAfterJustificationChange successfully.");
};
    
// Ensure checkAndUpdateDaThucHien is robust
     const checkAndUpdateDaThucHien = async (childPath) => {
        const childRef = ref(db, childPath);
        const childSnap = await get(childRef);
        if (!childSnap.exists()) return;

        const childData = childSnap.val();
        let hasExecutions = false;

        // Recursive function to check for executions down the tree
        const findExecutions = async (node, currentPath) => {
            if (hasExecutions) return; // Stop searching if already found

            // Check current node for executions if it's a leaf node type
            // Sửa lại điều kiện kiểm tra lá: dựa vào hasChildren hoặc sự tồn tại của các collection con
            const isPotentiallyLeaf = !(node.hasChildren === true || node.children || node.grandchildren || node.greatGrandchildren || node.greatGreatGrandchildren);

            if (isPotentiallyLeaf) {
                 const execRef = ref(db, `${currentPath}/executions`);
                 const execSnapshot = await get(execRef);
                 if (execSnapshot.exists() && Object.keys(execSnapshot.val()).length > 0) {
                    hasExecutions = true;
                    //console.log(`Executions found at leaf: ${currentPath}`);
                    return;
                 }
            }

            // Recursively check children collections (sử dụng for...in vì cấu trúc là object)
            if (node.grandchildren) {
                for (const id in node.grandchildren) {
                    // Cần lấy dữ liệu con đầy đủ để kiểm tra tiếp
                    const grandchildNodeSnap = await get(ref(db, `${currentPath}/grandchildren/${id}`));
                    if(grandchildNodeSnap.exists()) await findExecutions(grandchildNodeSnap.val(), `${currentPath}/grandchildren/${id}`);
                    if (hasExecutions) return;
                }
            }
            if (node.greatGrandchildren) {
                 for (const id in node.greatGrandchildren) {
                    const greatGrandchildNodeSnap = await get(ref(db, `${currentPath}/greatGrandchildren/${id}`));
                    if(greatGrandchildNodeSnap.exists()) await findExecutions(greatGrandchildNodeSnap.val(), `${currentPath}/greatGrandchildren/${id}`);
                    if (hasExecutions) return;
                }
            }
             if (node.greatGreatGrandchildren) {
                 for (const id in node.greatGreatGrandchildren) {
                    // Cấp 5 là lá, kiểm tra trực tiếp executions
                     const execRef = ref(db, `${currentPath}/greatGreatGrandchildren/${id}/executions`);
                     const execSnapshot = await get(execRef);
                     if (execSnapshot.exists() && Object.keys(execSnapshot.val()).length > 0) {
                        hasExecutions = true;
                        //console.log(`Executions found at greatGreatGrandchild: ${currentPath}/greatGreatGrandchildren/${id}`);
                        return;
                     }
                 }
             }
        };

        // Start the recursive check from the child node
        await findExecutions(childData, childPath);

        // Update the daThucHien status only if it changed
        if (childData.daThucHien !== hasExecutions) {
            await update(ref(db), { [`${childPath}/daThucHien`]: hasExecutions ? true : null });
        }
     }; // <-- Đóng hàm checkAndUpdateDaThucHien ở đây

	window.calculateSummaryData = async function() {
    try {
        if(typeof statusDiv !== 'undefined') {
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đang tính toán dữ liệu tổng hợp...';
        }
        
        const parentQuery = ref(db, getParentCollectionName());
        const parentSnapshot = await get(parentQuery);
        
        if (!parentSnapshot.exists()) {
            const summaryRef = ref(db, `summary_data/${currentYear}`);
            await set(summaryRef, null);
            if(typeof statusDiv !== 'undefined') statusDiv.innerText = '';
            const summarySec = document.getElementById('summarySection');
            if(summarySec) summarySec.innerHTML = '<p>Không có dữ liệu tổng hợp cho năm này.</p>';
            return;
        }

        const parentsData = parentSnapshot.val();
        const summaryData = {};

        // Khởi tạo object chứa dữ liệu tổng hợp
        for (const parentId in parentsData) {
             summaryData[parentId] = {
                 totalLeafNodes: 0,
                 totalExecutedLeafNodes: 0,
                 totalLeafNodesCap1: 0,
                 totalExecutedLeafNodesCap1: 0,
                 totalPlannedCost: parentsData[parentId].chiPhi || 0, 
                 totalExecutedCost: parentsData[parentId].chiPhiThucHien || 0 
             };
        }

        // --- HÀM HELPER: Lấy Tần suất kế hoạch ---
        const getPlannedCount = (node) => {
            const val = node.tanSuatTH;
            
            // Nguyên tắc 2: Bỏ trống, xóa trắng, hoặc null trong CSDL -> Tính là 1
            if (val === null || val === undefined || val === '') return 1;
            
            // Nguyên tắc 1: Chính xác là số 0 hoặc gạch ngang -> Tính là 0
            if (val === 0 || val === '0' || val === '-') return 0;
            
            // Nguyên tắc 3: Là các số khác -> Tính theo giá trị đó
            const num = parseInt(val, 10);
            
            // Nguyên tắc 4: Bị nhập chữ cái hoặc ký tự lạ không parse ra số được -> Tính là 0
            if (isNaN(num)) return 0;
            
            return num;
        };

        // --- HÀM HELPER: Kiểm tra Cấp độ 1 ---
        const isCapDo1 = (node) => {
            const cd = String(node.capDo || '').trim();
            return cd === '' || cd === '1';
        };

        // --- LOGIC MỚI: Tính số lượng thực hiện cho Level 4 (GreatGrandchildren) ---
        const calculateL4ExecutedCount = (node, plannedCount) => {
            // Điều kiện tiên quyết: Phải có daThucHien = true
            if (node.daThucHien !== true) return 0;

            const hasL5 = node.greatGreatGrandchildren && Object.keys(node.greatGreatGrandchildren).length > 0;
            const chiPhi = node.chiPhi || 0;
            let rawCount = 0;

            // TRƯỜNG HỢP 1: CHI PHÍ > 0
            if (chiPhi > 0) {
                if (hasL5) {
                    // Tình huống 1.2: Có con cấp 5 -> Đếm Timestamp duy nhất
                    const uniqueTimestamps = new Set();
                    Object.values(node.greatGreatGrandchildren).forEach(l5 => {
                        if (l5.executions) {
                            Object.values(l5.executions).forEach(ex => {
                                if (ex.timestamp) uniqueTimestamps.add(ex.timestamp);
                            });
                        }
                    });
                    rawCount = uniqueTimestamps.size;
                } else {
                    // Tình huống 1.1: Có executions trực tiếp -> Đếm tổng số dòng
                    if (node.executions) {
                        rawCount = Object.keys(node.executions).length;
                    }
                }
            } 
            // TRƯỜNG HỢP 2: CHI PHÍ = 0
            else {
                if (hasL5) {
                    // Tình huống 2.2: Giống 1.2 (Đếm Timestamp duy nhất)
                    const uniqueTimestamps = new Set();
                    Object.values(node.greatGreatGrandchildren).forEach(l5 => {
                        if (l5.executions) {
                            Object.values(l5.executions).forEach(ex => {
                                if (ex.timestamp) uniqueTimestamps.add(ex.timestamp);
                            });
                        }
                    });
                    rawCount = uniqueTimestamps.size;
                } else {
                    // Tình huống 2.1: Có executions trực tiếp -> Đếm dòng hợp lệ (Có Link HOẶC Tiền > 0)
                    if (node.executions) {
                        Object.values(node.executions).forEach(ex => {
                            const hasLink = ex.hoSoLink && ex.hoSoLink.trim() !== '';
                            const hasMoney = (ex.thanhTien || 0) > 0;
                            if (hasLink || hasMoney) {
                                rawCount++;
                            }
                        });
                    }
                }
            }

            // Kết quả là Min(Kế hoạch, Thực tế đếm được)
            return Math.min(plannedCount, rawCount);
        };

        // --- DUYỆT CÂY DỮ LIỆU ---
        const processNode = (node, path) => {
            if (node && node.tt) { 
                const parentId = path.split('/')[1];
                const parentSummary = summaryData[parentId]; 
                if (!parentSummary) return; 

                // Xác định cấp độ dựa trên path
                const isL5 = path.includes('/greatGreatGrandchildren/');
                const isL4 = path.includes('/greatGrandchildren/') && !isL5;
                const isL3 = path.includes('/grandchildren/') && !isL4; // L3 đóng vai trò lá nếu không có L4

                // Bỏ qua Level 5 (Chi tiết vật tư không tính là đầu việc chính để đếm)
                if (isL5) return; 

                // Kiểm tra xem node hiện tại có phải là Container không
                const hasL4Children = node.greatGrandchildren && Object.keys(node.greatGrandchildren).length > 0;
                const hasL3Children = node.grandchildren && Object.keys(node.grandchildren).length > 0;
                const hasL2Children = node.children && Object.keys(node.children).length > 0;

                let isContainer = false;
                if (isL4) {
                    // Level 4 được coi là lá trong ngữ cảnh đếm số lượng công việc (dù có thể có con L5)
                    isContainer = false; 
                } else {
                    // Các cấp khác nếu có con thì là container
                    if (node.hasChildren === true) isContainer = true;
                    else if (node.hasChildren === false) isContainer = false;
                    else isContainer = hasL2Children || hasL3Children || hasL4Children;
                }

                // CHỈ TÍNH TOÁN VỚI NODE LÁ (Hoặc Level 4)
                if (!isContainer) {
                    const plannedCount = getPlannedCount(node);
                    
                    // 1. Cộng tổng Kế hoạch
                    parentSummary.totalLeafNodes += plannedCount;
                    if (isCapDo1(node)) {
                        parentSummary.totalLeafNodesCap1 += plannedCount;
                    }

                    // 2. Tính số lượng Đã thực hiện (Executed)
                    let executedCount = 0;

                    if (plannedCount > 0) { // Chỉ tính nếu có kế hoạch làm
                        if (isL4) {
                            // === LOGIC MỚI CHO LEVEL 4 ===
                            executedCount = calculateL4ExecutedCount(node, plannedCount);
                        } else {
                            // === LOGIC CŨ CHO LEVEL 3 (HOẶC KHÁC) ===
                            // Giữ nguyên logic cũ cho các node lá không phải Level 4
                            const hasRealCost = (node.chiPhiThucHien || 0) > 0;
                            let totalExecutions = 0;
                            let validExecutionsWithLink = 0;
                            
                            if (node.executions) {
                                totalExecutions = Object.keys(node.executions).length;
                                Object.values(node.executions).forEach(ex => {
                                    if (ex.hoSoLink && ex.hoSoLink.trim() !== '') validExecutionsWithLink++;
                                });
                            }

                            if ((node.chiPhi || 0) === 0) {
                                if (plannedCount > 1) {
                                    let count = validExecutionsWithLink;
                                    if (count === 0 && hasRealCost) count = totalExecutions > 0 ? totalExecutions : 1;
                                    executedCount = Math.min(plannedCount, count);
                                } else {
                                    executedCount = (validExecutionsWithLink > 0 || hasRealCost) ? 1 : 0;
                                }
                            } else {
                                if (plannedCount > 1) {
                                    executedCount = Math.min(plannedCount, totalExecutions);
                                } else {
                                    executedCount = hasRealCost ? 1 : 0;
                                }
                            }
                        }
                    }

                    // 3. Cộng tổng Thực hiện
                    // a) Tính cho Tổng thể (Mọi cấp độ)
                    parentSummary.totalExecutedLeafNodes += executedCount;

                    // b) Tính cho Cấp độ 1 (Filter theo capDo)
                    if (isCapDo1(node)) {
                        parentSummary.totalExecutedLeafNodesCap1 += executedCount;
                    }
                }
            }

            // Đệ quy
            if (node.children) for (const k in node.children) processNode(node.children[k], `${path}/children/${k}`);
            if (node.grandchildren) for (const k in node.grandchildren) processNode(node.grandchildren[k], `${path}/grandchildren/${k}`);
            if (node.greatGrandchildren) for (const k in node.greatGrandchildren) processNode(node.greatGrandchildren[k], `${path}/greatGrandchildren/${k}`);
            if (node.greatGreatGrandchildren) for (const k in node.greatGreatGrandchildren) processNode(node.greatGreatGrandchildren[k], `${path}/greatGreatGrandchildren/${k}`);
        };
        
        for (const parentId in parentsData) {
            processNode(parentsData[parentId], `${getParentCollectionName()}/${parentId}`);
        }

        const summaryRef = ref(db, `summary_data/${currentYear}`);
        await set(summaryRef, summaryData);
        
        if(typeof statusDiv !== 'undefined') statusDiv.innerText = '';
        if (typeof fetchData === 'function') fetchData(); 

    } catch (error) {
        console.error("Lỗi khi tính toán dữ liệu tổng hợp:", error);
        if(typeof statusDiv !== 'undefined') {
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi khi tính toán summary: ${error.message}`;
        }
    }
};



    async function ensureYearCollectionExists(year) {
        const collectionName = `congViecMe${year}`;
        try {
            const testQuery = ref(db, collectionName);
            const testSnapshot = await get(testQuery);
            if (!testSnapshot.exists()) {
                console.log(`Collection cho năm ${year} chưa tồn tại, sẽ được tạo khi có dữ liệu`);
            }
        } catch (error) {
            console.log(`Collection cho năm ${year} chưa tồn tại, sẽ được tạo khi có dữ liệu`);
        }
    }

    const planningPasswords = {
        'all': '2662', 'A': '8726', 'B': '8646', 'C': '8734',
        'D': '8663', 'E': '8853', 'F': '3822'
    };

    function openPlanningModeModal() {
        const modal = document.getElementById('planningModeModal');
        const optionsContainer = document.getElementById('planningModeOptions');
        optionsContainer.innerHTML = '';

        const allButton = document.createElement('button');
        allButton.className = 'btn-primary';
        allButton.textContent = 'Tất cả dữ liệu';
        allButton.style.cssText = 'width: 100%; margin-bottom: 10px; text-align: left; padding: 12px;';
        allButton.onclick = () => promptForPlanningPassword('all', 'Tất cả dữ liệu');
        optionsContainer.appendChild(allButton);

        const parentRows = document.querySelectorAll('.task-parent');
        parentRows.forEach(row => {
            const tt = row.querySelector('.col-tt').textContent;
            const noiDung = row.querySelector('.col-noidung').textContent;
            const parentButton = document.createElement('button');
            parentButton.className = 'btn-secondary';
            parentButton.textContent = `${tt}. ${noiDung}`;
            parentButton.style.cssText = 'width: 100%; margin-bottom: 10px; text-align: left; padding: 12px;';
            parentButton.onclick = () => promptForPlanningPassword(tt, `${tt}. ${noiDung}`);
            optionsContainer.appendChild(parentButton);
        });

        modal.style.display = 'block';
    }

    window.promptForPlanningPassword = function(selectionId, selectionText) {
        const correctPassword = planningPasswords[selectionId];
        if (!correctPassword) {
            activatePlanningModeForSelection(selectionId);
            return;
        }

        const enteredPassword = prompt(`Vui lòng nhập mật khẩu để xem phạm vi:\n"${selectionText}"`);

        if (enteredPassword === null) {
            return;
        }

        if (enteredPassword === correctPassword) {
            activatePlanningModeForSelection(selectionId);
        } else {
            alert('Mật khẩu không chính xác.');
        }
    };

    window.closePlanningModal = function() {
        document.getElementById('planningModeToggle').checked = false;
        document.getElementById('planningModeModal').style.display = 'none';
    }

    function activatePlanningModeForSelection(selectionId) {
        const taskList = document.getElementById('taskList');
        planningModeByYear[currentYear] = true;

        taskList.classList.add('planning-mode');
        document.getElementById('exportExcel1Btn').disabled = true;
        document.getElementById('exportExcel2Btn').disabled = false;

        const allRows = document.querySelectorAll('#taskListBody tr');
        allRows.forEach(row => {
            if (selectionId === 'all' || row.dataset.mainParent === selectionId) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });

        document.getElementById('planningModeModal').style.display = 'none';
    }

   // XỬ LÝ AUTH STATE
    onAuthStateChanged(auth, async (user) => {
        const authButton = document.getElementById('authButton');
        const logoutButton = document.getElementById('logoutButton');
		
		manageFacilityName();

        if (user) {
            // --- TRƯỜNG HỢP ĐÃ ĐĂNG NHẬP ---
            isAuthenticated = true;
            if (authButton) authButton.style.display = 'none';
            if (logoutButton) logoutButton.style.display = 'inline-block';

            loginContainer.style.display = 'none';
            mainContainer.style.display = 'block';

            // Logic lắng nghe trạng thái khóa/mở (Giữ nguyên)
            const settingsRef = ref(db, 'settings/global');
            onValue(settingsRef, (snapshot) => {
                if (snapshot.exists()) {
                    const val = snapshot.val(); // [SỬA] Lấy toàn bộ val để bóc tách
                    editModeStatusByYear = val.editModeStatus || {};
                    lockedYears = val.lockedYears || {}; // [THÊM MỚI] Đồng bộ dữ liệu khóa
                } else {
                    editModeStatusByYear = {};
                    lockedYears = {}; // [THÊM MỚI]
                }
                
                const modal = document.getElementById('dataManagementModal');
                if (modal.style.display === 'block') {
                     const isUnlocked = editModeStatusByYear[currentYear] === true;
                     if (isUnlocked) {
                         document.getElementById('unlockButton').style.display = 'none';
                         document.getElementById('editModeToggle').style.display = 'block';
                         document.getElementById('editModeCheckbox').checked = true;
                     }
                }
                updateButtonStates();
            });

            // === CẬP NHẬT QUAN TRỌNG TẠI ĐÂY ===
            // Thay vì gọi fetchData(), ta gọi recalculateAllCostsAndReload(false)
            // Tham số 'false' nghĩa là chạy ngay lập tức KHÔNG hiện bảng hỏi "Confirm"
            // Hàm này đã bao gồm bước fetchData() ở cuối cùng nên không cần gọi lại.
            
            // Hiển thị thông báo đang xử lý để người dùng biết
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đăng nhập thành công. Đang rà soát và tính toán lại dữ liệu...';
            
            await recalculateAllCostsAndReload(false); 
            // ====================================

        } else {
            // --- TRƯỜNG HỢP CHƯA ĐĂNG NHẬP / ĐĂNG XUẤT ---
            isAuthenticated = false;
            if (authButton) authButton.style.display = 'inline-block';
            if (logoutButton) logoutButton.style.display = 'none';
            mainContainer.style.display = 'block';
            loginContainer.style.display = 'none';
            
            // Người xem bình thường chỉ cần tải dữ liệu hiển thị (nhanh hơn)
            fetchData();
        }
    });

    // XỬ LÝ LOGIN FORM (Chuyển sang bắt Click và phím Enter)
    const handleLogin = async () => {
        const email = document.getElementById('email').dataset.realEmail;
        const passwordInput = document.getElementById('password');
        const password = passwordInput.value;
        const loginButton = document.getElementById('login-button');

        if (!password) {
            loginError.textContent = "Vui lòng nhập mật khẩu.";
            loginError.style.display = 'block';
            return;
        }

        loginError.style.display = 'none';
        loginButton.disabled = true;
        loginButton.textContent = 'Đang xử lý...';
        
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Chủ động xóa trắng ô mật khẩu ngay khi đăng nhập thành công
            passwordInput.value = ''; 
        } catch (error) {
            console.error("Lỗi đăng nhập:", error);
            let errorMessage = "Đã xảy ra lỗi. Vui lòng thử lại.";
            if (error.code === 'auth/invalid-credential') errorMessage = "Mật khẩu không chính xác.";
            loginError.textContent = errorMessage;
            loginError.style.display = 'block';
        } finally {
            loginButton.disabled = false;
            loginButton.textContent = 'Đăng nhập';
        }
    };

    // 1. Lắng nghe sự kiện click vào nút
    document.getElementById('login-button').addEventListener('click', handleLogin);

    // 2. Lắng nghe sự kiện gõ phím Enter tại ô mật khẩu
    document.getElementById('password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Ngăn mọi hành vi nổi bọt hoặc submit ngầm
            handleLogin();
        }
    });

    // KHỞI TẠO ỨNG DỤNG
  // KHỞI TẠO ỨNG DỤNG
    window.addEventListener('DOMContentLoaded', async function() { // Thêm async ở đây
        // === THÊM ĐOẠN NÀY ĐỂ ĐĂNG XUẤT KHI TẢI TRANG ===
        try {
            await signOut(auth); // Thực hiện đăng xuất
            console.log('Đã tự động đăng xuất người dùng cũ (nếu có).');
        } catch (error) {
            console.error('Lỗi khi tự động đăng xuất:', error);
            
        }
        // ===============================================

        // Các hàm khởi tạo khác
        initializeYearDropdown();
        

        // Gán sự kiện double click cho bảng (cho sửa nội tuyến)
        const taskListBody = document.getElementById('taskListBody');
        if (taskListBody) {
            taskListBody.addEventListener('dblclick', makeCellEditable);
        }

        // --- Quản lý việc chạy calculateSummaryData ---
        let summaryIntervalId = null; // Biến để lưu ID của interval

        // Hàm để bắt đầu tính summary và đặt lịch chạy định kỳ
        function startSummaryInterval() {
             if (summaryIntervalId) clearInterval(summaryIntervalId); // Xóa interval cũ nếu đang chạy
             // Chạy tính toán lần đầu (nên đợi fetchData xong)
             // calculateSummaryData(); // Chạy ngay có thể gây lỗi nếu fetchData chưa xong
             // Đặt lịch chạy định kỳ 5 phút một lần
             summaryIntervalId = setInterval(calculateSummaryData, 300000);
        }

        // Hàm dừng tính summary định kỳ (ví dụ khi đăng xuất)
        function stopSummaryInterval() {
            if (summaryIntervalId) {
                clearInterval(summaryIntervalId);
                summaryIntervalId = null;
            }
        }
        // --- Kết thúc quản lý calculateSummaryData ---


        // Gọi startSummaryInterval hoặc các xử lý khác sau khi dữ liệu được tải
        // (thông qua onAuthStateChanged)

    }); // Kết thúc DOMContentLoaded


    

 // =========================================================================
    // CÁC HÀM HỖ TRỢ EXCEL CHO MODAL KẾT HỢP
    // =========================================================================

    // 1. Xuất dữ liệu trên Modal ra file Excel (Làm mẫu)
    window.exportCombinedModalTemplate = function() {
        const rows = document.querySelectorAll("#dataModal .modal-table tbody tr");
        if (rows.length === 0) {
            alert("Không có dữ liệu để xuất.");
            return;
        }

        const dataForExcel = [];
        // Header
        dataForExcel.push(["TT", "Nội dung công việc", "Đơn vị", "Số lượng", "Đơn giá", "Thành tiền"]);

        // Data Rows
        rows.forEach(row => {
            const tt = row.querySelector('input[data-field="tt"]').value;
            const noiDung = row.querySelector('input[data-field="noiDung"]').value;
            const donVi = row.querySelector('input[data-field="donVi"]').value;
            const sl = row.querySelector('input[data-field="dvt"]').value; // DVT ở đây là Số lượng
            const donGia = row.querySelector('input[data-field="donGia"]').value;
            const thanhTien = row.querySelector('input[data-field="thanhTien"]').value;

            dataForExcel.push([tt, noiDung, donVi, sl, donGia, thanhTien]);
        });

        const ws = XLSX.utils.aoa_to_sheet(dataForExcel);
        
        // Chỉnh độ rộng cột cho đẹp
        ws['!cols'] = [{wch: 5}, {wch: 40}, {wch: 10}, {wch: 10}, {wch: 15}, {wch: 15}];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Mau_Nhap_Lieu");
        XLSX.writeFile(wb, "Mau_Nhap_Lieu_Chi_Tiet.xlsx");
    };

    // 2. Nhập dữ liệu từ Excel vào Modal
    window.importCombinedModalData = function(input) {
        if (!input.files || input.files.length === 0) return;

        const file = input.files[0];
        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Chuyển sheet thành JSON (bỏ dòng header đầu tiên)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                // Lọc bỏ dòng tiêu đề và các dòng trống
                // Giả sử dòng 0 là Header, dữ liệu bắt đầu từ dòng 1
                const dataRows = jsonData.slice(1).filter(row => row.length > 0 && (row[1] || row[3])); 

                const modalRows = document.querySelectorAll("#dataModal .modal-table tbody tr");

                // --- KIỂM TRA SỐ LƯỢNG DÒNG ---
                if (dataRows.length > modalRows.length) {
                    const missing = dataRows.length - modalRows.length;
                    alert(`File Excel có ${dataRows.length} dòng dữ liệu, nhưng bảng hiện tại chỉ có ${modalRows.length} dòng.\n\nVui lòng nhấn nút "+ Thêm dòng" thêm ${missing} lần nữa rồi thử nhập lại.`);
                    input.value = ''; // Reset input để chọn lại file
                    return;
                }

                // --- ĐIỀN DỮ LIỆU ---
                dataRows.forEach((rowData, index) => {
                    if (index >= modalRows.length) return; // An toàn

                    const rowDom = modalRows[index];
                    // Mapping theo thứ tự cột trong file Excel xuất ra ở hàm trên
                    // [0]: TT, [1]: Nội dung, [2]: Đơn vị, [3]: Số lượng, [4]: Đơn giá
                    
                    const noiDung = rowData[1] || '';
                    const donVi = rowData[2] || '';
                    const soLuong = rowData[3] || '';
                    const donGia = rowData[4] || '';

                    // Điền giá trị
                    rowDom.querySelector('input[data-field="noiDung"]').value = noiDung;
                    rowDom.querySelector('input[data-field="donVi"]').value = donVi;
                    
                    const slInput = rowDom.querySelector('input[data-field="dvt"]'); // Field dvt là số lượng
                    slInput.value = soLuong;
                    
                    const dgInput = rowDom.querySelector('input[data-field="donGia"]');
                    dgInput.value = donGia;

                    // Gọi hàm tính thành tiền cho dòng này
                    calculateCombinedThanhTien(slInput); 
                });

                alert(`Đã nhập thành công ${dataRows.length} dòng từ Excel!`);

            } catch (error) {
                console.error("Lỗi nhập Excel:", error);
                alert("Lỗi khi đọc file Excel. Vui lòng kiểm tra lại định dạng.");
            } finally {
                input.value = ''; // Reset input
            }
        };

        reader.readAsArrayBuffer(file);
    };

/**
 * Biến một ô <td> thành <input> để chỉnh sửa nội tuyến.
 */
/**
 * Xử lý sự kiện nhấn phím Enter (lưu) và Escape (hủy)
 */
function handleInputKeydown(event) {
    // Sử dụng event.key thay vì keyCode
    if (event.key === 'Enter') {
        event.preventDefault(); // Ngăn hành vi mặc định của Enter
        event.target.blur();    // Kích hoạt sự kiện 'blur' (làm mất focus)
    } else if (event.key === 'Escape') {
        event.preventDefault(); // Ngăn hành vi mặc định của Escape
        // Đặt lại giá trị gốc *trước khi* làm mất focus
        event.target.value = event.target.dataset.originalValue; 
        event.target.blur();    // Kích hoạt 'blur'
    }
}

// =========================================================================
    // HÀM SỬA NỘI TUYẾN (MAKE CELL EDITABLE) - ĐẦY ĐỦ
    // =========================================================================
    async function makeCellEditable(event) {
        // 1. Xác định ô được click
        const td = event.target.closest('.editable-cell');
        if (!td) return; 

        // 2. Kiểm tra xác thực (Đăng nhập)
        if (typeof isAuthenticated !== 'undefined' && !isAuthenticated) {
            if (typeof showAuthError === 'function') showAuthError();
            return; 
        }
        
        // 3. Kiểm tra Khóa năm (Locked Year) - Ưu tiên cao nhất
        // lockedYears là biến toàn cục lưu trạng thái khóa của từng năm
        if (typeof lockedYears !== 'undefined' && lockedYears[currentYear] === true) {
            alert(`Năm ${currentYear} đã bị khóa. Không thể chỉnh sửa.`);
            return;
        }

        // [THAY ĐỔI]: Rút trích field sớm để làm căn cứ nới lỏng quyền
        const field = td.dataset.field;

        // 4. [QUAN TRỌNG] Kiểm tra Chế độ Sửa (Edit Mode) theo Năm
        // editModeStatusByYear là biến toàn cục lưu trạng thái bật/tắt sửa của từng năm
        if (typeof editModeStatusByYear === 'undefined' || editModeStatusByYear[currentYear] !== true) {
            // Nếu chưa bật chế độ sửa -> Dừng lại, TRỪ trường hợp đang click vào cột Ghi chú
            if (field !== 'ghiChu') {
                return;
            }
        }

        // 5. Kiểm tra nếu ô đã có input rồi thì không làm gì cả (tránh render lại)
        if (td.querySelector('.editable-input') || td.querySelector('.editable-textarea')) return;

        // 6. Lấy thông tin định danh
        const tr = td.closest('tr');
        const path = tr.dataset.path;
        // Biến field đã được khai báo ở trên nên bỏ dòng const field = ... ở đây
        
       
        // Kiểm tra class 'task-great-grandchild' hoặc logic tương đương
        if (field === 'tgHoanThanh') {
            // Cách 1: Dựa vào class (nếu có gán lúc render)
            if (!tr.classList.contains('task-great-grandchild')) {
                // Cách 2: Dựa vào path (nếu path chứa 'greatGrandchildren' và ko chứa 'greatGreat')
                const isL4 = path.includes('/greatGrandchildren/') && !path.includes('/greatGreatGrandchildren/');
                if (!isL4) return; 
            }
        }
		
        if (!path || !field) { console.error("Thiếu data path hoặc field"); return; }

        // 7. Tạo Input/Textarea
        const originalValue = td.textContent; // Lấy text hiện tại
        let input;
        
        // Các trường văn bản dài dùng Textarea
        const isLongTextField = ['ghiChu', 'noiDung'].includes(field);
        
        if (isLongTextField) {
             input = document.createElement('textarea');
             input.className = 'editable-textarea';
             input.value = originalValue;
             
             // Style cho textarea
             input.style.width = '100%';
             input.style.minHeight = '60px';
             input.style.resize = 'vertical';
             input.style.fontFamily = 'inherit';
             input.style.fontSize = 'inherit';
             input.style.border = '1px solid #007bff';
             input.style.outline = 'none';
             input.style.padding = '5px';
             input.style.boxSizing = 'border-box';

             // Auto-resize chiều cao
             const autoResize = () => {
                input.style.height = 'auto'; 
                input.style.height = input.scrollHeight + 'px';
            };
            input.addEventListener('input', autoResize);
            setTimeout(autoResize, 0); // Trigger 1 lần đầu

        } else {
             input = document.createElement('input');
             input.className = 'editable-input';
             
             // Xử lý kiểu số
             if (['chiPhi', 'khNamTruoc', 'thucHienNamTruoc', 'soLuong', 'donGia', 'namPhanBo', 'tanSuatTH', 'tgHoanThanh'].includes(field)) {
                 let val = 0;
                 if (field === 'tanSuatTH' && originalValue.trim() === '-') {
                     val = 0;
                 } else if (field === 'soLuong') {
                     val = parseNumber(originalValue); // Tách soLuong khi lấy giá trị cũ
                 } else {
                     val = (typeof parseFormattedNumber === 'function') ? parseFormattedNumber(originalValue) : originalValue;
                 }
                 input.value = val;
                 input.type = 'number';
                 input.step = 'any'; // [QUAN TRỌNG] Trình duyệt không chặn gõ số thập phân
                 if (field === 'tanSuatTH') input.style.textAlign = 'center';
            } else {
                 input.value = originalValue;
                 input.type = 'text';
            }

            // Style cho input thường
            input.style.width = '100%';
            input.style.padding = '5px';
            input.style.boxSizing = 'border-box';
            input.style.border = '1px solid #007bff';
            input.style.outline = 'none';
            input.style.fontFamily = 'inherit';
            input.style.fontSize = 'inherit';
        }
        
        // 8. Xử lý đặc biệt cho TAG
        if (field === 'tagName') {
            input.style.textAlign = 'center';
            input.style.fontWeight = 'bold';
            input.style.color = '#d63384';
            input.setAttribute('list', 'deviceTagsList'); // Gắn Datalist
            input.setAttribute('autocomplete', 'off');
            input.ondblclick = function() { this.value = ''; }; // Double click xóa nhanh
        }
        
        // Gắn metadata
        input.dataset.path = path;
        input.dataset.field = field;
        input.dataset.originalValue = originalValue;

        // 9. Sự kiện Lưu (OnBlur - Khi click ra ngoài)
        input.onblur = async function(e) {
            const newValue = input.value.trim();
            let oldValueCheck = originalValue;
            
            // Chuẩn hóa giá trị cũ để so sánh
            if (input.type === 'number' && typeof parseFormattedNumber === 'function') {
                if (field === 'tanSuatTH' && originalValue.trim() === '-') oldValueCheck = 0;
                else oldValueCheck = parseFormattedNumber(originalValue);
            }

            // Nếu không thay đổi -> Trả lại text cũ
            if (newValue == oldValueCheck) {
                 td.innerHTML = originalValue; 
                 return;
            }

            // Validate Tag Name (nếu cần)
            if (field === 'tagName' && newValue !== '') {
                if (typeof window.checkTagIsValid === 'function') {
                    const isValid = await window.checkTagIsValid(newValue);
                    if (!isValid) {
                        alert(`Mã Tag "${newValue}" không tồn tại trong danh sách!`);
                        td.innerHTML = originalValue;
                        return;
                    }
                }
            }

            // Gọi hàm lưu (saveInlineEdit cần được định nghĩa ở ngoài)
            if (typeof saveInlineEdit === 'function') {
                saveInlineEdit({ target: input });
            } else {
                console.error("Hàm saveInlineEdit chưa được định nghĩa!");
                td.innerHTML = newValue; // Fallback tạm thời
            }
        };

        // 10. Sự kiện Phím (Enter để lưu, Esc để hủy)
        input.onkeydown = function(e) {
            if (typeof handleInputKeydown === 'function') handleInputKeydown(e);
            
            if (e.key === 'Enter') {
                if (isLongTextField) {
                    // Với textarea, Enter xuống dòng, Shift+Enter mới lưu (hoặc ngược lại tùy UX)
                    // Ở đây: Shift+Enter hoặc Ctrl+Enter để lưu & blur
                    if (e.shiftKey || e.ctrlKey) { 
                        e.preventDefault(); 
                        input.blur(); 
                    }
                } else {
                    // Với input thường, Enter là lưu
                    input.blur();
                }
            }
            if (e.key === 'Escape') {
                // Hủy bỏ sửa
                td.innerHTML = originalValue;
            }
        };

        // 11. Đưa input vào DOM và Focus
        td.innerHTML = '';
        td.appendChild(input);
        input.focus();
        
        // Select toàn bộ text để sửa nhanh
        if (field === 'tagName' || !isLongTextField) {
            input.select();
        } else {
            // Textarea đặt con trỏ cuối dòng
            input.setSelectionRange(input.value.length, input.value.length);
        }
    }



// =========================================================================
    // HÀM LƯU SỬA NỘI TUYẾN (ĐÃ CẬP NHẬT CHO TẦN SUẤT)
    // =========================================================================
   window.saveInlineEdit = async function(event) {
        const input = event.target;
        const path = input.dataset.path;
        const field = input.dataset.field;
        let val = input.value.trim();

        if (!path || !field) return;

        // --- ĐÃ CHỈNH SỬA: Tách tanSuatTH ra xử lý riêng theo nguyên tắc ---
        if (field === 'tanSuatTH') {
            if (val === '') {
                val = 1; // Xóa trắng -> 1
            } else if (val === '-') {
                val = 0; // Gõ dấu - -> 0
            } else {
                const parsed = parseInt(val, 10);
                val = isNaN(parsed) ? 0 : parsed; // Ký tự lạ -> 0
            }
        } 
        else if (['chiPhi', 'khNamTruoc', 'thucHienNamTruoc', 'donGia', 'namPhanBo', 'tgHoanThanh'].includes(field)) {
            val = parseFormattedNumber(val); // Đã rút tanSuatTH ra khỏi mảng này
        } 
        else if (field === 'soLuong') {
            val = parseNumber(val); 
        }

        
        try {
            const updates = {};
            const fieldPath = `${path}/${field}`; // Dùng đường dẫn tuyệt đối chuẩn xác
            updates[fieldPath] = val;
            
            if (field === 'tagName' && val === '') updates[fieldPath] = null;

            let needReload = false;

            // [LOGIC QUÁ HẠN & TRUYỀN XUỐNG CẤP 4 TỪ INLINE EDIT]
            if (field === 'tgBatDau') {
                const isL3 = path.includes('/grandchildren/') && !path.includes('/greatGrandchildren/');
                const isL4 = path.includes('/greatGrandchildren/') && !path.includes('/greatGreatGrandchildren/');

                if (isL3 && val !== '') {
                    const snap = await get(ref(db, path));
                    if (snap.exists() && snap.val().greatGrandchildren) {
                        for (const l4Id in snap.val().greatGrandchildren) {
                            updates[`${path}/greatGrandchildren/${l4Id}/tgBatDau`] = val;
                            // Tính lại quá hạn cho Cấp 4 ngay lập tức
                            const l4Node = snap.val().greatGrandchildren[l4Id];
                            l4Node.tgBatDau = val; 
                            updates[`${path}/greatGrandchildren/${l4Id}/quaHan`] = window.checkOverdueStatus(l4Node, currentYear);
                        }
                        needReload = true;
                    }
                } else if (isL4) {
                    // Sửa trực tiếp Cấp 4 -> Tính lại quá hạn cho chính nó
                    const snap = await get(ref(db, path));
                    if (snap.exists()) {
                        const l4Node = snap.val();
                        l4Node.tgBatDau = val;
                        updates[`${path}/quaHan`] = window.checkOverdueStatus(l4Node, currentYear);
                        needReload = true;
                    }
                }
            }

            await update(ref(db), updates);

            // Tính toán lại các biến phụ thuộc
            if (['chiPhi', 'khNamTruoc', 'thucHienNamTruoc', 'tgBatDau'].includes(field)) {
                await recalculateCostsForParents([path]);
                await calculateSummaryData();
            }

            const td = input.closest('td');
            if (td) {
                if (field === 'tanSuatTH') td.innerText = (val === 0 || val === '0') ? '-' : val;
                else if (field === 'tagName') { await fetchData(); return; } 
                else if (['chiPhi', 'khNamTruoc', 'thucHienNamTruoc'].includes(field)) td.innerText = formatNumber(val);
                else td.innerText = val;
            }
            
            if (['chiPhi', 'khNamTruoc', 'thucHienNamTruoc', 'tgBatDau'].includes(field) || needReload) {
                 await fetchData(); 
                 return;
            }

            statusDiv.className = 'success';
            statusDiv.innerText = 'Đã lưu thay đổi!';
            setTimeout(() => statusDiv.innerText = '', 2000);

        } catch (error) {
            console.error("Lỗi lưu nội tuyến:", error);
            alert("Lỗi lưu dữ liệu: " + error.message);
            const td = input.closest('td');
            if(td) td.innerHTML = input.dataset.originalValue;
        }
    };

// ============================================================
    // BỘ HÀM TRA CỨU - SỬA - XÓA - UPLOAD (ĐÃ ĐỒNG BỘ CẤU TRÚC MAP)
    // ============================================================

    // 1. Modal Tra Cứu (Hiển thị phân cấp L2 -> L4 -> L5)
    window.openSearchModal = async function() {
        // --- [CODE MỚI] DỌN DẸP NÚT EXCEL DƯ THỪA TỪ MODAL KHÁC ---
        const footer = document.querySelector('.modal-footer');
        const oldExcel = footer.querySelector('.excel-dropdown-container');
        if (oldExcel) oldExcel.remove();
        // ----------------------------------------------------------
		
		const modal = document.getElementById('dataModal');
        // Tạo giao diện Tiêu đề, Thanh tìm kiếm và Ô tích lọc kết quả
        const titleHtml = `
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 15px;">
                <h2 style="margin: 0; color: #007bff; white-space: nowrap;">Tra cứu thực hiện công việc</h2>
                
                <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; padding: 0 20px; gap: 15px;">
                    <div style="position: relative; width: 100%; max-width: 350px;">
                        <span style="position: absolute; left: 12px; top: 9px; color: #888;">🔍</span>
                        <input type="text" id="modalSearchInput" placeholder="Nhập từ khóa (có hoặc không dấu)..." 
                               style="width: 100%; padding: 8px 15px 8px 35px; border: 1px solid #ccc; border-radius: 20px; box-sizing: border-box; font-size: 14px; outline: none; transition: border-color 0.2s;"
                               onfocus="this.style.borderColor='#007bff'" onblur="this.style.borderColor='#ccc'"
                               oninput="handleModalSearch(this.value)">
                    </div>

                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap; font-size: 13px; font-style: italic; color: #666; user-select: none;">
                        <input type="checkbox" id="hideUnmatchedCheck" style="cursor: pointer;"
                               onchange="handleModalSearch(document.getElementById('modalSearchInput').value)">
                        Ẩn các mục không được tìm
                    </label>
                </div>
                
                <div style="width: 250px; display: block;"></div> 
            </div>
        `;
        document.getElementById('modalTitle').innerHTML = titleHtml;


        const headers = [
            {text: 'Ngày thực hiện', width: '12%'},
            {text: 'Nội dung công việc', width: '48%'},
            {text: 'ĐV thực hiện', width: '10%'},
            {text: 'Thành tiền', width: '15%'},
            {text: 'Hành động', width: '15%'}
        ];
		const isYearLocked = lockedYears[currentYear] === true;
const disableAttr = isYearLocked ? 'disabled style="cursor:not-allowed; opacity:0.6"' : '';
        let table = createModalTable(headers);
        table += '</tbody></table>';
        document.getElementById('modalBody').innerHTML = table;
        document.getElementById('modalSaveButton').style.display = 'none';
        document.getElementById('modalDeleteButton').style.display = 'none';
        document.getElementById('modal-footer-left').innerHTML = '<button class="btn-success" onclick="exportExecutionSearchExcel()">Xuất Excel</button>';
        modal.style.display = 'block';

        try {
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đang tải dữ liệu thực hiện...';
            
            // Reset biến toàn cục
            executionGroups = new Map(); 

            const parentQuery = ref(db, getParentCollectionName());
            const parentSnapshot = await get(parentQuery);
            if (!parentSnapshot.exists()) {
                document.getElementById('modalBody').innerHTML = '<p>Không có dữ liệu thực hiện.</p>';
                statusDiv.innerText = '';
                return;
            }

            const parentsData = parentSnapshot.val();
            const allExecutions = [];

            // Helper đệ quy để lấy toàn bộ executions
            const processNodeForExecutions = (node, path) => {
                if (node.executions) {
                    const pathParts = path.split('/');
                    const isDeepLevel = pathParts.includes('greatGreatGrandchildren');
                    
                    // Lấy path Cấp 2 (Children)
                    const level2Path = pathParts.slice(0, 4).join('/');

                    // Lấy path Cha trực tiếp (Group Header)
                    let groupParentPath = '';
                    if (isDeepLevel) {
                        const parentIndex = pathParts.indexOf('greatGrandchildren') + 2; 
                        groupParentPath = pathParts.slice(0, parentIndex).join('/');
                    } else {
                        const parentIndex = pathParts.indexOf('grandchildren') + 2;
                        groupParentPath = pathParts.slice(0, parentIndex).join('/');
                    }

                                        for (const execId in node.executions) {
                        const exec = node.executions[execId];
                        
                        // --- LOGIC LẤY ĐƠN VỊ THỰC HIỆN ---
                        // Ưu tiên lấy dvThucHien của chính node đó.
                        // Nếu không có và node này thuộc Cấp 5 (chứa greatGreatGrandchildren trong path),
                        // ta sẽ tìm dvThucHien của node Cấp 4 cha từ docDataMap.
                        let displayDv = node.dvThucHien || '';
                        if (!displayDv && path.includes('/greatGreatGrandchildren/')) {
                            const l4Path = path.split('/greatGreatGrandchildren/')[0];
                            const l4Node = docDataMap.get(l4Path);
                            if (l4Node) displayDv = l4Node.dvThucHien || '';
                        }
                        // ---------------------------------

                        allExecutions.push({
                            ...exec,
                            path: `${path}/executions/${execId}`,
                            taskPath: path,
                            level2Path: level2Path,
                            groupParentPath: groupParentPath,
                            noiDung: node.noiDung || 'Không có tên',
                            dvThucHien: displayDv // Hiển thị giá trị đã lấy được
                        });
                    }


                }
                if (node.children) for (const k in node.children) processNodeForExecutions(node.children[k], `${path}/children/${k}`);
                if (node.grandchildren) for (const k in node.grandchildren) processNodeForExecutions(node.grandchildren[k], `${path}/grandchildren/${k}`);
                if (node.greatGrandchildren) for (const k in node.greatGrandchildren) processNodeForExecutions(node.greatGrandchildren[k], `${path}/greatGrandchildren/${k}`);
                if (node.greatGreatGrandchildren) for (const k in node.greatGreatGrandchildren) processNodeForExecutions(node.greatGreatGrandchildren[k], `${path}/greatGreatGrandchildren/${k}`);
            };

            for (const parentId in parentsData) {
                processNodeForExecutions(parentsData[parentId], `${getParentCollectionName()}/${parentId}`);
            }

            // Sắp xếp theo ngày giảm dần
            allExecutions.sort((a, b) => {
                const dateA = new Date(a.ngayThucHien || 0);
                const dateB = new Date(b.ngayThucHien || 0);
                if (dateB - dateA !== 0) return dateB - dateA;
                return (b.timestamp || 0) - (a.timestamp || 0);
            });

            // Gom nhóm vào Map
            allExecutions.forEach(exec => {
                const tsKey = String(exec.timestamp || exec.ngayThucHien);
                if (!executionGroups.has(tsKey)) executionGroups.set(tsKey, new Map());
                
                const l2Map = executionGroups.get(tsKey);
                if (!l2Map.has(exec.level2Path)) l2Map.set(exec.level2Path, new Map());
                
                const parentMap = l2Map.get(exec.level2Path);
                if (!parentMap.has(exec.groupParentPath)) parentMap.set(exec.groupParentPath, []);
                
                parentMap.get(exec.groupParentPath).push(exec);
            });

            // Render HTML
            let tbody = '';
            const sortedTimestamps = Array.from(executionGroups.keys()).sort((a, b) => {
                 const getFirst = (key) => {
                     const l2Map = executionGroups.get(key);
                     for(let pMap of l2Map.values()) for(let execs of pMap.values()) return execs[0];
                 };
                 const firstA = getFirst(a), firstB = getFirst(b);
                 const dateA = new Date(firstA?.ngayThucHien || 0), dateB = new Date(firstB?.ngayThucHien || 0);
                 if (dateB - dateA !== 0) return dateB - dateA;
                 return (firstB?.timestamp || 0) - (firstA?.timestamp || 0);
            });

            for (const tsKey of sortedTimestamps) {
                const l2Map = executionGroups.get(tsKey);
                const allExecsInTs = []; 
                for (const pMap of l2Map.values()) {
                    for (const execs of pMap.values()) allExecsInTs.push(...execs);
                }
                
                if (allExecsInTs.length === 0) continue;
                const firstExec = allExecsInTs[0];
                const totalThanhTien = allExecsInTs.reduce((sum, e) => sum + (e.thanhTien || 0), 0);
                
                let contentHtml = '';
                
                // Helper lấy tên Node an toàn kèm TT
                const getNodeName = (path) => {
                    if (!path) return '';
                    const node = docDataMap.get(path);
                    if (node) return `${convertTTForDisplay(node.tt)}. ${node.noiDung}`;
                    return path.split('/').pop(); 
                };

                // Xây dựng cây phân cấp (L2 -> L3 -> L4 -> L5)
                const tree = {};
                allExecsInTs.forEach(exec => {
                    const parts = exec.taskPath.split('/');
                    if (parts.length < 8) return;

                    const l2Path = parts.slice(0, 4).join('/');
                    const l3Path = parts.slice(0, 6).join('/');
                    const l4Path = parts.slice(0, 8).join('/');
                    const isL5 = parts.length >= 10;

                    if (!tree[l2Path]) tree[l2Path] = {};
                    if (!tree[l2Path][l3Path]) tree[l2Path][l3Path] = {};
                    if (!tree[l2Path][l3Path][l4Path]) tree[l2Path][l3Path][l4Path] = [];

                    if (isL5) {
                        tree[l2Path][l3Path][l4Path].push(exec.noiDung);
                    }
                });

                // Render HTML theo cấu trúc Cây (Đã bỏ nhãn L3, L4, L5)
                const sortedL2Paths = Object.keys(tree).sort((a,b) => romanToNumber(a.split('/').pop()) - romanToNumber(b.split('/').pop()));
                
                for (const l2Path of sortedL2Paths) {
                    // Dòng 1: CẤP 2 (Lĩnh vực) - Cố định 14px
                    contentHtml += `<div style="color: #2E7D32; font-size: 14px; margin-top: 5px;">${getNodeName(l2Path)}</div>`;
                    
                    const sortedL3Paths = Object.keys(tree[l2Path]).sort((a,b) => parseInt(a.split('/').pop()) - parseInt(b.split('/').pop()));
                    for (const l3Path of sortedL3Paths) {
                        // Dòng 2: CẤP 3
                        contentHtml += `<div style="font-weight: bold; color: #1565C0; "margin-left: 10px; border-left: 1px dashed #a5d6a7; padding-left: 8px; margin-top: 3px;">
                            ${getNodeName(l3Path)}
                        </div>`;
                        
                        const numericSortArr = (a, b) => {
                            const pA = String(a.split('/').pop()).split(',').map(Number);
                            const pB = String(b.split('/').pop()).split(',').map(Number);
                            for (let i = 0; i < Math.max(pA.length, pB.length); i++) {
                                const vA = pA[i] || 0, vB = pB[i] || 0;
                                if (vA !== vB) return vA - vB;
                            }
                            return 0;
                        };

                        const sortedL4Paths = Object.keys(tree[l2Path][l3Path]).sort(numericSortArr);
                        for (const l4Path of sortedL4Paths) {
                            // Dòng 3: CẤP 4
                            contentHtml += `<div style="margin-left: 20px; color: #E65100; border-left: 1px dashed #ffcc80; padding-left: 8px; margin-top: 3px;">
                                ${getNodeName(l4Path)}
                            </div>`;
                            
                            const l5Items = tree[l2Path][l3Path][l4Path];
                            // Dòng 4: CẤP 5
                            l5Items.forEach(noiDungL5 => {
                                contentHtml += `<div style="margin-left: 30px; color: #424242; border-left: 1px dashed #e0e0e0; padding-left: 8px; margin-top: 3px;">
                                    ${noiDungL5}
                                </div>`;
                            });
                        }
                    }
                }

                const hasHoSoLink = allExecsInTs.some(e => e.hoSoLink && e.hoSoLink.trim() !== '');
                const hoSoButtonClass = hasHoSoLink ? 'btn-danger' : 'btn-info';
                const hoSoButtonText = hasHoSoLink ? 'Thay HS' : 'Hồ sơ';

                // Ép kích thước font 18px cho toàn bộ dòng (L2 sẽ tự động ưu tiên 14px (không bị thu lại 70%) ở trong)
                tbody += `<tr style="font-size: 18px;">
                    <td style="vertical-align: top;">${firstExec.ngayThucHien}</td>
                    <td style="vertical-align: top;">${contentHtml}</td>
                    <td style="vertical-align: top;">${firstExec.dvThucHien}</td>
                    <td class="text-right" style="vertical-align: top;">${formatNumber(totalThanhTien)}</td>
                    <td style="vertical-align: top;">
                        <button class="${hoSoButtonClass} btn-action btn-profile-exec" onclick="openExecutionProfile('${tsKey}')" ${disableAttr}>${hoSoButtonText}</button>
                        <button class="btn-warning btn-action btn-edit-exec" onclick="openExecutionEdit('${tsKey}')" ${disableAttr}>Sửa</button>
                    </td>
                </tr>`;
            }

            document.querySelector('#dataModal .modal-table tbody').innerHTML = tbody || '<tr><td colspan="5" class="text-center">Không tìm thấy dữ liệu.</td></tr>';
            statusDiv.innerText = '';
        } catch (error) {
            console.error("Lỗi tải dữ liệu thực hiện:", error);
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi: ${error.message}`;
        }
    };

    // =========================================================================
    // 1.1 HÀM TÌM KIẾM, HIGHLIGHT VÀ LỌC DÒNG (HỖ TRỢ TIẾNG VIỆT KHÔNG DẤU)
    // =========================================================================
    window.handleModalSearch = function(searchTerm) {
        const container = document.querySelector('#dataModal .modal-table tbody'); 
        if (!container) return;
        
        // Lấy trạng thái của ô tích lọc
        const hideUnmatched = document.getElementById('hideUnmatchedCheck')?.checked;
        const allRows = container.querySelectorAll('tr');

        // 1. Xóa toàn bộ highlight cũ và hiển thị lại tất cả các dòng để reset
        const marks = container.querySelectorAll('mark.highlight-search');
        marks.forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize(); 
        });
        allRows.forEach(row => row.style.display = '');

        // Nếu ô tìm kiếm rỗng -> Dừng lại sau khi đã reset
        if (!searchTerm.trim()) return; 

        // 2. CHUẨN HÓA: Tạo Regex hỗ trợ tiếng Việt không dấu
        const normalizedTerm = searchTerm.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
        const accentMap = {
            'a': '[aAàÀảẢãÃáÁạẠăĂằẰẳẲẵẴắẮặẶâÂầẦẩẨẫẪấẤậẬ]',
            'e': '[eEèÈẻẺẽẼéÉẹẸêÊềỀểỂễỄếẾệỆ]',
            'i': '[iIìÌỉỈĩĨíÍịỊ]',
            'o': '[oOòÒỏỎõÕóÓọỌôÔồỒổỔỗỖốỐộỘơƠờỜởỞỡỠớỚợỢ]',
            'u': '[uUùÙủỦũŨúÚụỤưƯừỪửỬữỮứỨựỰ]',
            'y': '[yYỳỲỷỶỹỸýÝỵỴ]',
            'd': '[dDđĐ]'
        };

        let fuzzyTerm = '';
        for (let i = 0; i < normalizedTerm.length; i++) {
            let char = normalizedTerm[i].toLowerCase();
            if (/[.*+?^${}()|[\]\\]/.test(char)) {
                fuzzyTerm += '\\' + char;
            } else if (accentMap[char]) {
                fuzzyTerm += accentMap[char];
            } else {
                fuzzyTerm += char;
            }
        }
        const regex = new RegExp(`(${fuzzyTerm})`, 'gi'); 

        // 3. Dùng TreeWalker để duyệt Text Node và Highlight
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        const textNodes = [];
        while (walker.nextNode()) {
            const parentName = walker.currentNode.parentNode.nodeName;
            if (parentName !== 'SCRIPT' && parentName !== 'STYLE' && parentName !== 'BUTTON') {
                textNodes.push(walker.currentNode);
            }
        }

        let firstMatchNode = null;
        textNodes.forEach(node => {
            const val = node.nodeValue;
            if (val.trim() !== '' && regex.test(val)) {
                const frag = document.createDocumentFragment();
                let lastIdx = 0;
                regex.lastIndex = 0; 
                let match;
                while ((match = regex.exec(val)) !== null) {
                    frag.appendChild(document.createTextNode(val.substring(lastIdx, match.index)));
                    const mark = document.createElement('mark');
                    mark.className = 'highlight-search';
                    mark.textContent = match[0]; 
                    frag.appendChild(mark);
                    if (!firstMatchNode) firstMatchNode = mark;
                    lastIdx = match.index + match[0].length;
                }
                frag.appendChild(document.createTextNode(val.substring(lastIdx)));
                node.parentNode.replaceChild(frag, node);
            }
        });

        // 4. LOGIC LỌC DÒNG: Nếu tích ô "Ẩn các mục không được tìm"
        if (hideUnmatched) {
            allRows.forEach(row => {
                // Kiểm tra xem trong dòng này có chứa thẻ highlight nào không
                const hasHighlight = row.querySelector('mark.highlight-search');
                if (!hasHighlight) {
                    row.style.display = 'none'; // Ẩn dòng không khớp
                }
            });
        }

        // 5. Cuộn tự động đến kết quả đầu tiên
        if (firstMatchNode) {
            firstMatchNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    // 2. Modal Sửa (Safe Flattening & Null Check)
    window.openExecutionEdit = function(timestampKey) {
        if (!isAuthenticated) return showAuthError();
		
		
        const modal = document.getElementById('dataModal');
        const tsKey = String(timestampKey);

        // Kiểm tra biến toàn cục
        if (!executionGroups || !(executionGroups instanceof Map)) {
            alert("Dữ liệu chưa sẵn sàng. Vui lòng tải lại Modal Tra cứu.");
            return;
        }

        let group = [];
        if (executionGroups.has(tsKey)) {
            const l2Map = executionGroups.get(tsKey);
            if (l2Map) {
                for (const pMap of l2Map.values()) {
                    for (const execs of pMap.values()) {
                        if (Array.isArray(execs)) group.push(...execs);
                    }
                }
            }
        }

        // Check an toàn: Nếu group rỗng hoặc phần tử đầu tiên undefined
        if (group.length === 0 || !group[0]) {
            alert("Không tìm thấy dữ liệu để sửa. Vui lòng tải lại trang.");
            return;
        }

        const firstExec = group[0];
        // Check an toàn khi truy cập thuộc tính
        const ngayHienThi = firstExec.ngayThucHien || 'N/A';
        
        const title = `Sửa lần thực hiện ngày ${ngayHienThi}`;
        document.getElementById('modalTitle').innerHTML = `<h2>${title}</h2>`;

        const headers = [
            {text: 'TT', width: '5%'},
            {text: 'Nội dung công việc', width: '40%'},
            {text: 'Số lượng', width: '12%'},
            {text: 'Đơn giá', width: '15%'},
            {text: 'Thành tiền', width: '18%'}
        ];
        let table = createModalTable(headers);

        group.forEach((exec, index) => {
            table += `<tr data-exec-path="${exec.path}">
                <td><input type="text" value="${index + 1}" disabled></td>
                <td><input type="text" value="${exec.noiDung}" disabled></td>
                <td><input type="number" step="any" value="${exec.dvt}" data-field="dvt" oninput="calculateThanhTien(this)" onfocus="this.select()"></td>
                <td><input type="number" value="${exec.donGia}" data-field="donGia" oninput="calculateThanhTien(this)" onfocus="this.select()"></td>
                <td><input type="text" value="${formatNumber(exec.thanhTien)}" data-field="thanhTien" disabled></td>
            </tr>`;
        });

        table += '</tbody></table>';
        document.getElementById('modalBody').innerHTML = table;

        document.getElementById('modalSaveButton').onclick = saveExecutionEdits;
        document.getElementById('modalSaveButton').style.display = 'block';

        const keyParam = `'${tsKey}'`;
        document.getElementById('modal-footer-left').innerHTML = `
            <button class="btn-danger" onclick="handleDeleteExecution(${keyParam})">Xóa lần thực hiện này</button>
            <button class="btn-info" onclick="openExecutionProfile(${keyParam})">Tải lên Hồ sơ</button>
        `;

        document.getElementById('modalDeleteButton').style.display = 'none';
        modal.style.display = 'block';
    };

    // 3. Hàm Xóa (Recursive Map traversal)
    window.handleDeleteExecution = async function(timestampKey) {
        if (!isAuthenticated) return showAuthError();
        if (!confirm("Bạn có chắc chắn muốn xóa lần thực hiện này không? Hành động này không thể hoàn tác.")) return;
        
        try {
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đang xóa dữ liệu...';

            let group = [];
            const tsKey = String(timestampKey);
            
            if (executionGroups.has(tsKey)) {
                const l2Map = executionGroups.get(tsKey);
                for (const pMap of l2Map.values()) {
                    for (const execs of pMap.values()) group.push(...execs);
                }
            }

            if (group.length === 0) {
                alert("Không tìm thấy dữ liệu để xóa.");
                return;
            }
            
            const updates = {};
            const pathsToRecalculate = new Set();
            const parentPathsToCheck = new Set();

            group.forEach(exec => {
                updates[exec.path] = null;
                const taskPath = exec.path.substring(0, exec.path.lastIndexOf('/executions/'));
                pathsToRecalculate.add(taskPath);
                // Lưu lại Group Parent Path (Cấp 4) để check lại cờ daThucHien
                if (exec.groupParentPath) parentPathsToCheck.add(exec.groupParentPath);
            });

            await update(ref(db), updates);
            statusDiv.innerText = "Đang cập nhật lại chi phí...";
            
            const recalcPromises = Array.from(pathsToRecalculate).map(path => recalculateExecutionCost(path));
            await Promise.all(recalcPromises);

            await recalculateCostsForParents(Array.from(pathsToRecalculate));

            for (const pPath of parentPathsToCheck) {
                await checkAndUpdateDaThucHien(pPath);
            }

            closeAllModals();
            await fetchData();
            statusDiv.innerText = "Đã xóa thành công.";

        } catch (error) {
             console.error("Lỗi khi xóa:", error);
             statusDiv.className = 'error';
             statusDiv.innerText = `Lỗi khi xóa: ${error.message}`;
        }
    };

    // 4. Hàm Upload PDF 
    window.openExecutionProfile = async function(timestampKey) {
    if (!isAuthenticated) return showAuthError();

    const tsKey = String(timestampKey);
    document.getElementById('uploadPdfModalTitle').textContent = 'Tải lên/Cập nhật Hồ sơ PDF';
    document.getElementById('uploadPdfButton').onclick = () => performPdfUpload(tsKey);
    document.getElementById('pdf_file_input').value = '';
    document.getElementById('uploadPdfModal').style.display = 'block';
};

	window.performPdfUpload = async function(timestampKey) {
    if (!isAuthenticated) return showAuthError(); 

    const uploadButton = document.getElementById('uploadPdfButton');
    const fileInput = document.getElementById('pdf_file_input');
    const file = fileInput.files[0];
    
    if (!file) { alert('Vui lòng chọn một tệp PDF.'); return; }
    if (file.size > 1024 * 1024 * 50) { alert('Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 50MB.'); return; }
    
    try {
        uploadButton.disabled = true; 
        uploadButton.textContent = 'Đang tải...';
        statusDiv.className = 'success'; 
        statusDiv.innerText = 'Đang xác thực bảo mật và tải tệp lên Google Drive...';
        
        const base64Data = await readFileAsBase64(file);
        const token = await getRecaptchaToken('upload_execution');
        
        const formData = new FormData();
        formData.append('fileName', file.name);
        formData.append('mimeType', file.type);
        formData.append('fileData', base64Data);
        formData.append('recaptchaToken', token);
        
        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        if (result.status !== "success") throw new Error(result.message);
        
        const fileLink = result.url;
        statusDiv.innerText = 'Đang cập nhật CSDL...';

        const tsKey = String(timestampKey);
        const updates = {};
        let updatedCount = 0;

        if (executionGroups.has(tsKey)) {
            const l2Map = executionGroups.get(tsKey);
            for (const pMap of l2Map.values()) {
                for (const execs of pMap.values()) {
                    execs.forEach(exec => {
                        updates[`${exec.path}/hoSoLink`] = fileLink;
                        updatedCount++;
                    });
                }
            }
        }

        if (updatedCount > 0) {
             await update(ref(db), updates);
        }

        closeAllModals(); 
        await openSearchModal(); 
        statusDiv.className = 'success';
        statusDiv.innerText = `Cập nhật hồ sơ thành công!`;

    } catch (error) {
        console.error('Lỗi upload:', error);
        statusDiv.className = 'error';
        statusDiv.innerText = `Lỗi: ${error.message}`;
    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = 'Tải Lên';
        fileInput.value = ''; 
    }
};

  

// =========================================================================
    // HÀM QUẢN LÝ DỮ LIỆU THIẾT BỊ (CACHE & OPTIMIZATION)
    // =========================================================================
    window.getDeviceTagOptions = async function() {
        // 1. Kiểm tra Cache RAM (Nhanh nhất)
        if (window.deviceTagsHTMLCache) return window.deviceTagsHTMLCache;

        // 2. Kiểm tra Cache Trình duyệt (SessionStorage) - Giữ được khi F5
        const sessionData = sessionStorage.getItem('deviceTagsHTML');
        if (sessionData) {
            window.deviceTagsHTMLCache = sessionData;
            return sessionData;
        }

        // 3. Nếu chưa có, tải từ Firebase (Chỉ chạy 1 lần/phiên)
        try {
            const snapshot = await get(ref(db, 'Quanlythietbi'));
            if (!snapshot.exists()) return '';

            let optionsHtml = '';
            const data = snapshot.val(); // Node Gốc

            // Duyệt Cấp 1: Số La Mã (I, II...)
            Object.values(data).forEach(groupLaMa => {
                if (!groupLaMa || typeof groupLaMa !== 'object') return;
                
                // Duyệt Cấp 2: Số Đếm (1, 2...)
                Object.values(groupLaMa).forEach(item => {
                    if (!item || typeof item !== 'object') return;

                    // Tìm key TagName và TenThietBi (Không phân biệt hoa/thường)
                    const keys = Object.keys(item);
                    const tagKey = keys.find(k => k.toLowerCase() === 'tagname');
                    const nameKey = keys.find(k => k.toLowerCase() === 'tenthietbi');

                    if (tagKey && item[tagKey]) {
                        const tag = item[tagKey]; // Giá trị nhập vào
                        const name = nameKey ? item[nameKey] : ''; // Giá trị gợi ý
                        
                        // Tạo option: Value là Tag, Label là Tên thiết bị
                        // Trình duyệt sẽ hiển thị: [P-01] Máy bơm nước...
                        optionsHtml += `<option value="${tag}">${name}</option>`;
                    }
                });
            });

            // 4. Lưu Cache
            window.deviceTagsHTMLCache = optionsHtml;
            sessionStorage.setItem('deviceTagsHTML', optionsHtml);
            
            return optionsHtml;
        } catch (error) {
            console.error("Lỗi tải danh sách xe:", error);
            return '';
        }
    };
    
    // Hàm hỗ trợ chèn Datalist vào DOM nếu chưa có (Dùng cho Inline Edit)
    window.ensureDatalistInDOM = async function() {
        if (!document.getElementById('deviceTagsList')) {
            const options = await getDeviceTagOptions();
            const datalist = document.createElement('datalist');
            datalist.id = 'deviceTagsList';
            datalist.innerHTML = options;
            document.body.appendChild(datalist);
        }
    };
// =========================================================================
    // BẮT ĐẦU: CÁC HÀM XỬ LÝ GIAO DIỆN & EXCEL (ĐÃ CẬP NHẬT TAG NAME)
    // =========================================================================

    // 3.3. Hàm Mở Modal Thêm Mới
    window.openAddModal = async function(parentPath, level) {
        if (!isAuthenticated) return showAuthError();
// --- [THÊM ĐOẠN NÀY] Xóa nút Excel dư thừa từ modal kết hợp ---
        const oldExcel = document.querySelector('.excel-dropdown-container');
        if (oldExcel) oldExcel.remove();
        // ---------------------------------------------------
        if (level === 'greatGreatGrandchild') {
            await openCombinedAddModal(parentPath);
            return;
        }
        
        // === CODE MỚI: Chuẩn bị Datalist cho TagName ===
        let datalistHtml = '';
        if (level === 'grandchild') {
             // Chỉ tải khi cần thiết (Level Child)
             const tagOptions = await getDeviceTagOptions();
             datalistHtml = `<datalist id="deviceTagsList">${tagOptions}</datalist>`;
        }
        // ==============================================

        let title;
        if (level === 'justification') title = 'Thêm giải trình';
        else if (level === 'subJustification') title = 'Thêm giải trình con';
        else if (level === 'child') title = 'THÊM HỆ THỐNG THIẾT BỊ, CÔNG TRÌNH';
        else if (level === 'grandchild') title = 'THÊM THIẾT BỊ, HẠNG MỤC';
        else if (level === 'greatGrandchild') title = 'THÊM CÔNG VIỆC HOẶC PHỤ TÙNG THAY THẾ';
        else if (level === 'greatGreatGrandchild') title = 'THÊM VẬT TƯ/PHỤ TÙNG CHI TIẾT';
        else title = `Thêm mục mới (Cấp: ${level})`;
        
        document.getElementById('modalTitle').innerHTML = `<h2>${title}</h2>`;

        const isGrandchildLevel = level === 'grandchild';
        let headers = [];
        
        if (level === 'justification' || level === 'subJustification') {
            headers = [ 
                {text: 'TT', width: '5%'}, 'Nội dung', {text: 'Đ.vị tính', width: '10%'}, 
                {text: 'Số lượng', width: '10%'}, {text: 'Đơn giá', width: '15%'}, {text: 'Chi phí', width: '15%'}
            ];
        } else {
            headers = [ 
                {text: 'TT', width: '4%'}, 
                {text: 'Nội dung', width: isGrandchildLevel ? '15%' : '20%'}, 
                ...(isGrandchildLevel ? [{text: 'Tag Name', width: '5%'}] : []),
                {text: 'ĐV th.hiện', width: '5%'}, {text: 'KH năm trước', width: '6%'}, 
                {text: 'Thực hiện năm trước', width: '6%'}, {text: 'Đ.vị tính', width: '4%'}, 
                {text: 'Số lượng', width: '5%'}, {text: 'Tần suất', width: '3%'}, 
                {text: 'Chi phí', width: '7%'}, {text: 'Năm PB', width: '3%'},     
                {text: 'CP phân bổ', width: '3%'}, {text: 'Cấp độ', width: '3%'}, 
                {text: 'Thời điểm TH', width: '5%'},
							
                {text: 'Ghi chú', width: '15%'} 
            ];
        }

        let table = createModalTable(headers);
        const newTT = await generateNextTT(parentPath, level);
        const convertedNewTT = convertTTForStorage(newTT);
        const newData = { tt: convertedNewTT };
        const dummyPath = `new_item_${Date.now()}`;
        
        table += createInputRow(dummyPath, newData, level);
        table += '</tbody></table>';

        // Nhúng datalistHtml vào body modal
        document.getElementById('modalBody').innerHTML = datalistHtml + table;
        
        document.getElementById('modalSaveButton').onclick = () => saveNewTasks(parentPath, level);
        
        document.getElementById('modal-footer-left').innerHTML = `
            <button class="btn-info" onclick="addNewRowToModal('${parentPath}', '${level}')" title="Thêm dòng mới">+ Thêm dòng</button>
        `;

        document.getElementById('modalSaveButton').style.display = 'block';
        document.getElementById('modalDeleteButton').style.display = 'none';
        document.getElementById('dataModal').style.display = 'block';
        
        setTimeout(() => {
            const firstInput = document.querySelector("#dataModal .modal-table tbody tr input[data-field='noiDung']");
            if(firstInput) firstInput.focus();
        }, 100);
    };

    // 3.4. Hàm Mở Modal Sửa
 // =========================================================================
    // 1. HÀM MỞ MODAL SỬA (GIỮ NGUYÊN LOGIC CŨ - ĐÃ BỎ TG HOÀN THÀNH)
    // =========================================================================
    window.handleEditClick = async function(docPath, level) {
        if (!isAuthenticated) return showAuthError();
        
		// --- [THÊM ĐOẠN NÀY] Xóa nút Excel dư thừa ---
        const oldExcel = document.querySelector('.excel-dropdown-container');
        if (oldExcel) oldExcel.remove();
        // ---------------------------------------------
        // --- LOGIC CŨ: XỬ LÝ ĐA CHỌN (MULTI-SELECT) ---
        const allSelected = [...selectedTasks, ...selectedJustifications];
        // Nếu mục được click nằm trong danh sách đã chọn -> Sửa tất cả các mục đã chọn
        const isMultiSelect = allSelected.some(p => p === docPath) && allSelected.length > 1;

        let pathsToEdit = isMultiSelect ? allSelected.sort() : [docPath];
        let title = isMultiSelect ? `Sửa ${pathsToEdit.length} mục đã chọn` : 'Sửa thông tin';
        document.getElementById('modalTitle').innerHTML = `<h2>${title}</h2>`;

        const isJustification = level === 'justification' || (pathsToEdit[0] && pathsToEdit[0].includes('justifications'));
        const isGrandchildLevel = !isJustification && (level === 'grandchild' || (pathsToEdit[0] && pathsToEdit[0].includes('/grandchildren/') && !pathsToEdit[0].includes('/greatGrandchildren/')));

        // Chuẩn bị Datalist cho TagName
        let datalistHtml = '';
        if (isGrandchildLevel) {
             const tagOptions = await getDeviceTagOptions();
             datalistHtml = `<datalist id="deviceTagsList">${tagOptions}</datalist>`;
        }

        // --- CẤU HÌNH HEADER (ĐÃ XÓA 'TG hoàn thành') ---
        const headers = isJustification
            ? [ 
                {text: 'TT', width: '5%'}, 'Nội dung', {text: 'Đ.vị tính', width: '10%'}, 
                {text: 'Số lượng', width: '10%'}, {text: 'Đơn giá', width: '15%'}, {text: 'Chi phí', width: '15%'}
            ]
            : [ 
                {text: 'TT', width: '4%'}, 
                {text: 'Nội dung', width: isGrandchildLevel ? '15%' : '20%'}, 
                ...(isGrandchildLevel ? [{text: 'Tag Name', width: '5%'}] : []),
                {text: 'ĐV th.hiện', width: '5%'}, {text: 'KH năm trước', width: '6%'}, 
                {text: 'Thực hiện năm trước', width: '6%'}, {text: 'Đ.vị tính', width: '4%'}, 
                {text: 'Số lượng', width: '5%'}, {text: 'Tần suất', width: '3%'}, 
                {text: 'Chi phí', width: '7%'}, {text: 'Năm PB', width: '3%'},     
                {text: 'CP phân bổ', width: '3%'}, {text: 'Cấp độ', width: '3%'}, 
                {text: 'Thời điểm TH', width: '5%'}, 
                
                {text: 'Ghi chú', width: '15%'} 
            ];

        let table = createModalTable(headers);
        
        // --- VÒNG LẶP TẠO DÒNG (GIỮ NGUYÊN LOGIC CŨ) ---
        for (const path of pathsToEdit) {
            const currentIsJustification = path.includes('justifications');
            // Bỏ qua nếu chọn lẫn lộn Task và Giải trình
            if (isMultiSelect && currentIsJustification !== isJustification) continue;
            
            const docSnap = await get(ref(db, path));
            if (!docSnap.exists()) continue;
            
            const data = docSnap.val();
            const pathLevel = currentIsJustification ? 'justification' : level;
            let context = {};
            // Kiểm tra xem task có giải trình con không để khóa chi phí
            if (pathLevel === 'greatGrandchild' && !data.hasChildren) {
                const justSnapshot = await get(ref(db, `${path}/justifications`));
                context.hasJustifications = justSnapshot.exists() && Object.keys(justSnapshot.val()).length > 0;
            }
            table += createInputRow(path, data, pathLevel, context);
        }
        table += '</tbody></table>';

        document.getElementById('modalBody').innerHTML = datalistHtml + table;
        
        // Gán sự kiện Save vào hàm saveTasks cũ
        document.getElementById('modalSaveButton').onclick = saveTasks;
        document.getElementById('modalSaveButton').style.display = 'block';
        document.getElementById('modalDeleteButton').style.display = 'none';
        document.getElementById('modal-footer-left').innerHTML = '';
        document.getElementById('dataModal').style.display = 'block';
    };

    // 3.5. Hàm Tạo Dòng Input (Helper)
  
    const createInputRow = (path, data, level, context = {}) => {
    const isJustification = level === 'justification';
    const isSubJustification = level === 'subJustification';
    const displayTT = convertTTForDisplay(data.tt);

    // 1. XỬ LÝ PHẦN GIẢI TRÌNH
    if (isJustification || isSubJustification) {
        const isParentJustification = isJustification && data.subJustifications && Object.keys(data.subJustifications).length > 0;
        const disabledAttr = isParentJustification ? 'disabled' : '';
        const formattedChiPhi = formatNumber(data.chiPhi || (data.soLuong * data.donGia) || 0);

        return `<tr data-path="${path}">
                <td><input type="text" value="${displayTT}" data-field="tt" disabled></td>
                <td><input type="text" value="${data.noiDung || ''}" data-field="noiDung" style="width:100%" onpaste="handlePasteFromExcel(event)"></td>
                <td><input type="text" value="${data.donVi || ''}" data-field="donVi" ${disabledAttr} onpaste="handlePasteFromExcel(event)"></td>
                <td><input type="number" step="any" value="${data.soLuong || ''}" data-field="soLuong" oninput="calculateModalChiPhi(this)" onfocus="this.select()" ${disabledAttr} onpaste="handlePasteFromExcel(event)"></td>
                <td><input type="number" value="${data.donGia || 0}" data-field="donGia" oninput="calculateModalChiPhi(this)" onfocus="this.select()" ${disabledAttr} onpaste="handlePasteFromExcel(event)"></td>
                <td><input type="text" value="${formattedChiPhi}" data-field="chiPhi" ${disabledAttr} oninput="this.value=formatNumber(parseNumber(this.value))"></td>
            </tr>`;
    }

    // 2. XỬ LÝ PHẦN CÔNG VIỆC CHÍNH
    const isParent = ['parent', 'child', 'grandchild'].includes(level);
    const isContainerLeaf = level === 'greatGrandchild' && data.hasChildren;
    const isEditableLeaf = level === 'greatGreatGrandchild' || (level === 'greatGrandchild' && !data.hasChildren);
    const chiPhiDisabled = isEditableLeaf && context.hasJustifications;

    // Hàm phụ kiểm tra trạng thái disabled để tránh viết code quá dài trong template literal
    const checkDisabled = (field) => {
        if (field === 'tgHoanThanh') return level !== 'greatGrandchild';
        if (field === 'tt') return true;
        if (field === 'tagName') return level !== 'grandchild';
        if (field === 'namPhanBo') return isParent;
        if (isParent) {
            if (level === 'grandchild' && field === 'chiPhi') return false;
            return !['noiDung', 'ghiChu', 'dvThucHien', 'capDo', 'khNamTruoc', 'thucHienNamTruoc', 'tgBatDau', 'namPhanBo', 'tagName'].includes(field);
        }
        if (isContainerLeaf) {
    // Các trường luôn cho phép sửa
    if (['noiDung', 'ghiChu', 'capDo', 'dvThucHien', 'tgBatDau', 'namPhanBo'].includes(field)) return false;
    
    // [CẬP NHẬT] Cho phép sửa chiPhi nếu KHÔNG có Justifications
    // (Dù có greatGreatGrandchildren hay không, miễn không có giải trình là được sửa)
    if (field === 'chiPhi' && !context.hasJustifications) return false;

    // Các trường còn lại thì khóa
    return true; 
}
        if (field === 'chiPhi') return chiPhiDisabled;
        return false;
    };

    // Chuẩn bị các thuộc tính điều kiện
    const triggerCalc = isEditableLeaf ? 'oninput="calculateModalChiPhi(this)"' : '';
    const chiPhiEvent = (isEditableLeaf || level === 'grandchild') ? 'onfocus="this.select()"' : '';
    const displayTanSuatModal = (data.tanSuatTH !== undefined && data.tanSuatTH !== null && data.tanSuatTH !== '') ? data.tanSuatTH : 1;

    // --- GIẢI PHÁP CHO LỖI HIỂN THỊ: Tách cột TAG ra biến riêng ---
    let tagColumnHtml = '';
    if (level === 'grandchild') {
        const tagValue = data.tagName || '';
        tagColumnHtml = `<td><input type="text" value="${tagValue}" data-field="tagName" list="deviceTagsList" autocomplete="off" style="text-align:center; font-weight:normal; color:#d63384;" placeholder="TAG" onpaste="handlePasteFromExcel(event)"></td>`;
    }

    // Trả về chuỗi HTML chính (phẳng và sạch hơn)
    return `<tr data-path="${path}" data-is-leaf="${isEditableLeaf}">
            <td><input type="text" value="${displayTT}" data-field="tt" disabled></td>
            <td><input type="text" value="${data.noiDung || ''}" data-field="noiDung" ${checkDisabled('noiDung') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            
            ${tagColumnHtml}

            <td><input type="text" value="${data.dvThucHien || ''}" data-field="dvThucHien" ${checkDisabled('dvThucHien') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            <td><input type="text" value="${formatNumber(data.khNamTruoc || 0)}" data-field="khNamTruoc" oninput="this.value=formatNumber(parseNumber(this.value))" ${chiPhiEvent} ${checkDisabled('khNamTruoc') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            <td><input type="text" value="${formatNumber(data.thucHienNamTruoc || 0)}" data-field="thucHienNamTruoc" oninput="this.value=formatNumber(parseNumber(this.value))" ${chiPhiEvent} ${checkDisabled('thucHienNamTruoc') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            <td><input type="text" value="${data.donVi || ''}" data-field="donVi" ${checkDisabled('donVi') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            <td><input type="number" step="any" value="${data.soLuong || ''}" data-field="soLuong" ${checkDisabled('soLuong') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)" oninput="calculateModalChiPhi(this)"></td>
            <td><input type="number" value="${displayTanSuatModal}" data-field="tanSuatTH" ${checkDisabled('tanSuatTH') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            <td><input type="text" value="${formatNumber(data.chiPhi || 0)}" data-field="chiPhi" oninput="this.value=formatNumber(parseNumber(this.value)); ${isEditableLeaf ? 'calculateModalChiPhi(this)' : ''}" ${chiPhiEvent} ${checkDisabled('chiPhi') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            <td><input type="number" value="${data.namPhanBo || ''}" data-field="namPhanBo" ${triggerCalc} ${checkDisabled('namPhanBo') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            <td><input type="text" value="${formatNumber(data.chiPhiPhanBo || 0)}" data-field="chiPhiPhanBo" disabled></td>
            <td><input type="text" value="${data.capDo || ''}" data-field="capDo" ${checkDisabled('capDo') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>
            <td><input type="text" value="${data.tgBatDau || ''}" data-field="tgBatDau" data-original-value="${data.tgBatDau || ''}" ${checkDisabled('tgBatDau') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)"></td>

            <td><textarea data-field="ghiChu" rows="1" style="width:95%; resize:vertical; min-height:30px; padding:4px;" ${checkDisabled('ghiChu') ? 'disabled' : ''} onpaste="handlePasteFromExcel(event)">${data.ghiChu || ''}</textarea></td>
        </tr>`;
};

    // 3.6.1 Hàm Lưu Sửa
    window.saveTasks = async function() {
    if (!isAuthenticated) return showAuthError();
    const saveButton = document.getElementById('modalSaveButton');
    
    const rows = document.querySelectorAll("#dataModal .modal-table tbody tr");
    for (const row of rows) {
        const tagInput = row.querySelector('input[data-field="tagName"]');
        if (tagInput) {
            const val = tagInput.value;
            const isValid = await isValidTagName(val);
            if (!isValid) {
                alert(`Mã Tag "${val}" không tồn tại trong hệ thống!`);
                tagInput.focus(); tagInput.style.border = "2px solid red"; return; 
            } else tagInput.style.border = ""; 
        }
    }

    try {
        saveButton.disabled = true; saveButton.textContent = 'Đang lưu...';
        const updates = {};
        const pathsToRecalculate = new Set();
        const justificationPathsToRecalculate = new Set();

        for (const row of rows) {
            const path = row.dataset.path;
            const isLeafNode = row.dataset.isLeaf === 'true'; 
            const isJustification = path.includes('/justifications/');
            const isLevel5 = path.includes('/greatGreatGrandchildren/');

            // SỬA LỖI: Dùng for...of để chạy đồng bộ lệnh await
            const inputs = row.querySelectorAll('input[data-field], textarea[data-field]');
            for (const input of inputs) {
                const field = input.dataset.field;
                const fieldPath = `${path}/${field}`; 
                
                // Đổi 'return' thành 'continue' cho vòng lặp for
                if (isLevel5 && field === 'chiPhi') continue;
                if (field === 'chiPhi' && input.disabled) continue;
                
                if (field === 'tt') updates[fieldPath] = convertTTForStorage(input.value);
                else if (['chiPhi', 'khNamTruoc', 'thucHienNamTruoc', 'donGia', 'tgHoanThanh'].includes(field)) { 
                    updates[fieldPath] = parseFormattedNumber(input.value);
                }
                else if (field === 'soLuong') {
                    updates[fieldPath] = parseNumber(input.value);
                }
                else if (field === 'namPhanBo') {
                    updates[fieldPath] = (input.value.trim() === '' || input.value == 0) ? 1 : parseFormattedNumber(input.value);
                }
                else if (field === 'tanSuatTH') {
                    const rawVal = input.value.trim();
                    if (rawVal === '') {
                        updates[fieldPath] = 1;
                    } else if (rawVal === '-') {
                        updates[fieldPath] = 0;
                    } else {
                        const parsed = parseInt(rawVal, 10);
                        updates[fieldPath] = isNaN(parsed) ? 0 : parsed;
                    }
                }
                else if (field === 'tagName') updates[fieldPath] = input.value.trim();
                else {
                    updates[fieldPath] = input.value;
                    // [LOGIC MỚI]: Tự động truyền tgBatDau từ Cấp 3 xuống Cấp 4 qua Modal
                    if (field === 'tgBatDau' && input.value.trim() !== '') {
                        const originalVal = input.dataset.originalValue || '';
                        if (input.value.trim() !== originalVal) { // <-- LỚP CHẶN: Chỉ lan truyền khi L3 thực sự bị user sửa đổi
                            const isL3 = path.includes('/grandchildren/') && !path.includes('/greatGrandchildren/');
                            if (isL3) {
                                const snap = await get(ref(db, path));
                                if (snap.exists() && snap.val().greatGrandchildren) {
                                    for (const l4Id in snap.val().greatGrandchildren) {
                                        updates[`${path}/greatGrandchildren/${l4Id}/tgBatDau`] = input.value.trim();
                                        pathsToRecalculate.add(`${path}/greatGrandchildren/${l4Id}`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            if (isJustification) {
                const leafNodePath = path.substring(0, path.indexOf('/justifications/'));
                justificationPathsToRecalculate.add(leafNodePath);
                const soLuong = parseFormattedNumber(row.querySelector('input[data-field="soLuong"]')?.value || 0);
                const donGia = parseFormattedNumber(row.querySelector('input[data-field="donGia"]')?.value || 0);
                updates[`${path}/chiPhi`] = soLuong * donGia;
            } else {
                pathsToRecalculate.add(path);
                
                // [LOGIC PS] Cập nhật Kế hoạch còn lại
                if (!isLevel5) { 
                     const docSnap = await get(ref(db, path));
                     if (docSnap.exists()) {
                         const currentChiPhi = updates[`${path}/chiPhi`] !== undefined ? updates[`${path}/chiPhi`] : (docSnap.val().chiPhi || 0);
                         const currentThucHien = docSnap.val().chiPhiThucHien || 0;
                         
                         // Lấy CapDo từ input (ưu tiên) hoặc từ DB
                         let capDoVal = updates[`${path}/capDo`];
                         if (capDoVal === undefined) capDoVal = docSnap.val().capDo;
                         const isPs = String(capDoVal || '').trim().toLowerCase() === 'ps';

                         updates[`${path}/keHoachConLai`] = isPs ? 0 : (currentChiPhi - currentThucHien);
                     }
                }
                
                if (isLeafNode) {
                    const finalChiPhi = updates[`${path}/chiPhi`] ?? 0;
                    const nam = updates[`${path}/namPhanBo`] || 1;
                    updates[`${path}/chiPhiPhanBo`] = (nam > 0) ? Math.round(finalChiPhi / nam) : 0;
                }
            }
        }

        if (Object.keys(updates).length > 0) await update(ref(db), updates);
        
        if (justificationPathsToRecalculate.size > 0) await recalculateCostsAfterJustificationChange(Array.from(justificationPathsToRecalculate));
        if (pathsToRecalculate.size > 0) await recalculateCostsForParents(Array.from(pathsToRecalculate));

        await calculateSummaryData();
        closeAllModals();
        await fetchData();
        statusDiv.className = 'success';
        statusDiv.innerText = `Đã cập nhật thành công.`;

    } catch (error) {
        console.error("Lỗi:", error);
        statusDiv.className = 'error';
        statusDiv.innerText = `Lỗi: ${error.message}`;
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Lưu thay đổi';
    }
};

    // 3.6.2 Hàm Lưu Thêm Mới
    
		window.saveNewTasks = async function(parentPath, level) {
    if (!isAuthenticated) return showAuthError();
    const saveButton = document.getElementById('modalSaveButton');
    
    const rows = document.querySelectorAll("#dataModal .modal-table tbody tr");
    for (const row of rows) {
        const tagInput = row.querySelector('input[data-field="tagName"]');
        if (tagInput) {
            const val = tagInput.value;
            const isValid = await isValidTagName(val);
            if (!isValid) {
                alert(`Mã Tag "${val}" không tồn tại!`); tagInput.focus(); tagInput.style.border = "2px solid red"; return;
            }
        }
    }

    try {
        saveButton.disabled = true; saveButton.textContent = 'Đang lưu...';
        const updates = {};
        const parentUpdates = {}; 
        if (rows.length === 0) throw new Error("Không có dòng nào để lưu.");

        const pathsToRecalculate = new Set();
        const justificationPathsToRecalculate = new Set();

        let subCollectionName;
        if (level === 'child') subCollectionName = 'children';
        else if (level === 'grandchild') subCollectionName = 'grandchildren';
        else if (level === 'greatGrandchild') subCollectionName = 'greatGrandchildren';
        else if (level === 'greatGreatGrandchild') subCollectionName = 'greatGreatGrandchildren';
        else if (level === 'justification') subCollectionName = 'justifications';
        else if (level === 'subJustification') subCollectionName = 'subJustifications';
        
        const parentRef = ref(db, parentPath);
        const parentSnap = await get(parentRef);
        const parentData = parentSnap.exists() ? parentSnap.val() : {};

        for (const row of rows) {
            const newData = {};
            const ttInput = row.querySelector('input[data-field="tt"]');
            if (!ttInput) continue;
            const newTT = convertTTForStorage(ttInput.value);

            row.querySelectorAll('input[data-field]').forEach(input => {
                const field = input.dataset.field;
                if (field === 'tt') return; 
                if (['chiPhi', 'khNamTruoc', 'thucHienNamTruoc', 'tgHoanThanh', 'donGia'].includes(field)) {
                    newData[field] = parseFormattedNumber(input.value);
                } else if (field === 'soLuong') {
                    newData[field] = parseNumber(input.value); // Dùng parseNumber riêng cho số lượng
                } else if (field === 'namPhanBo') {
                     newData[field] = (input.value.trim() === '' || input.value == 0) ? 1 : parseFormattedNumber(input.value);
                
                } else if (field === 'tanSuatTH') {
                    const rawVal = input.value.trim();
                    if (rawVal === '') {
                        newData[field] = 1;
                    } else if (rawVal === '-') {
                        newData[field] = 0;
                    } else {
                        const parsed = parseInt(rawVal, 10);
                        newData[field] = isNaN(parsed) ? 0 : parsed;
                    }
                }
				else newData[field] = input.value;
            });

            newData.tt = newTT; 
            const newDocPath = `${parentPath}/${subCollectionName}/${newTT}`;

           if (level === 'justification' || level === 'subJustification') {
                newData.chiPhi = (newData.soLuong || 0) * (newData.donGia || 0);
                let leafNodePath = parentPath;
                if (level === 'subJustification') {
                    leafNodePath = parentPath.substring(0, parentPath.indexOf('/justifications/'));
                    // [SỬA LỖI] Bật cờ khai báo cha đã có giải trình con
                    parentUpdates[`${parentPath}/hasSubJustifications`] = true;
                }
                justificationPathsToRecalculate.add(leafNodePath);
                pathsToRecalculate.add(leafNodePath); 
            } else {
                newData.isHidden = false;
                if (level === 'greatGreatGrandchild') {
                    // Level 5 không lưu chi phí
                } else {
                    newData.chiPhi = newData.chiPhi || 0; 
                    
                    // [LOGIC PS]
                    const isPs = String(newData.capDo || '').trim().toLowerCase() === 'ps';
                    newData.keHoachConLai = isPs ? 0 : newData.chiPhi;
                }
                
                newData.chiPhiThucHien = 0;
                if (level === 'greatGrandchild') {
                    const nam = newData.namPhanBo || 1; 
                    newData.chiPhiPhanBo = Math.round((newData.chiPhi || 0) / nam);
                } else newData.chiPhiPhanBo = 0; 
                pathsToRecalculate.add(newDocPath);
            }

            if (!newData.noiDung) { alert("Nội dung không được để trống!"); throw new Error("Validation failed"); }
            updates[newDocPath] = newData;

            if (level === 'greatGreatGrandchild' && !parentUpdates[`${parentPath}/hasChildren`]) {
                 if (parentData && !parentData.hasChildren) {
                     parentUpdates[`${parentPath}/hasChildren`] = true;
                     parentUpdates[`${parentPath}/chiPhi`] = parentData.chiPhi || 0;
                     parentUpdates[`${parentPath}/chiPhiThucHien`] = 0;
                     parentUpdates[`${parentPath}/soLuong`] = ''; 
                     parentUpdates[`${parentPath}/donVi`] = ''; 
                 } else parentUpdates[`${parentPath}/hasChildren`] = true;
            }
        } 

        Object.assign(updates, parentUpdates);
        await update(ref(db), updates);

        if (justificationPathsToRecalculate.size > 0) await recalculateCostsAfterJustificationChange(Array.from(justificationPathsToRecalculate));
        if (pathsToRecalculate.size > 0) await recalculateCostsForParents(Array.from(pathsToRecalculate));
        
        closeAllModals();
        await fetchData();
        statusDiv.className = 'success';
        statusDiv.innerText = `Đã thêm thành công.`;

    } catch (error) {
        console.error("Lỗi lưu:", error);
        statusDiv.className = 'error';
        statusDiv.innerText = `Lỗi: ${error.message}`;
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Lưu thay đổi';
    }
};
   
    
   // 3.7. Hàm Tạo Worksheet Excel
async function generateWorksheetWithFormulas() {
    const parentQuery = ref(db, getParentCollectionName());
    const parentSnapshot = await get(parentQuery);
    if (!parentSnapshot.exists()) throw new Error('Không có dữ liệu để xuất.');
    const parentsData = parentSnapshot.val();

    const summaryRef = ref(db, `summary_data/${currentYear}`);
    const summarySnap = await get(summaryRef);
    const summaryData = summarySnap.exists() ? summarySnap.val() : {};

    const maxLanThucHien = findMaxExecutions(parentsData);

    const baseHeadersFull = [
        'TT', 'Nội dung', 'Tag Name', 'ĐV th.hiện', 'KH năm trước', 'Thực hiện năm trước', 
        'Tần suất TH', 'Đ.vị tính', 'Số lượng', 'Đơn giá (GT)', 'Chi phí KH', 
        'Chi phí thực hiện', 'Kế hoạch còn lại', 'Năm phân bổ', 'CP phân bổ', 
        'Cấp độ', 'CP CĐ1', 'Thời điểm TH', 'Ghi chú'
    ];
    
    const baseHeadersSimplified = baseHeadersFull.filter(h => 
        !['TG hoàn thành'].includes(h)
    );
    
    const headersToUse = activeExportType === 'full' ? baseHeadersFull : baseHeadersSimplified;
    
    const executionHeaders = [];
    const execHeaderMap = {};
    let currentColIndex = headersToUse.length; 
    
    for (let i = 1; i <= maxLanThucHien; i++) {
        const colMap = {};
        colMap.ngayTh = XLSX.utils.encode_col(currentColIndex); executionHeaders.push(`Ngày TH (${i})`); currentColIndex++;
        colMap.soLuong = XLSX.utils.encode_col(currentColIndex); executionHeaders.push(`Số lượng (${i})`); currentColIndex++;
        colMap.donGia = XLSX.utils.encode_col(currentColIndex); executionHeaders.push(`Đơn giá (${i})`); currentColIndex++;
        colMap.thanhTien = XLSX.utils.encode_col(currentColIndex); executionHeaders.push(`Thành tiền (${i})`); currentColIndex++;
        if (activeExportType === 'full') {
            colMap.timestamp = XLSX.utils.encode_col(currentColIndex); executionHeaders.push(`Timestamp (${i})`); currentColIndex++;
            colMap.hoSoLink = XLSX.utils.encode_col(currentColIndex); executionHeaders.push(`Hồ sơ Link (${i})`); currentColIndex++;
        }
        execHeaderMap[i] = colMap;
    }

    const finalHeaders = [...headersToUse, ...executionHeaders];
    const COLS = {};
    
    // [CẬP NHẬT] Đã thêm 'CP CĐ1': 'CP_CD1' vào map
    const colNameMap = {
        'TT': 'TT', 'Nội dung': 'NOI_DUNG', 'Tag Name': 'TAG_NAME',
        'ĐV th.hiện': 'DV_THUCHIEN', 'KH năm trước': 'KH_NAM_TRUOC', 'Thực hiện năm trước': 'TH_NAM_TRUOC',
        'Tần suất TH': 'TAN_SUAT', 'Đ.vị tính': 'DON_VI', 'Số lượng': 'SO_LUONG',
        'Đơn giá (GT)': 'DON_GIA', 'Chi phí KH': 'CHI_PHI',
        'Chi phí thực hiện': 'CHI_PHI_THUCHIEN', 'Kế hoạch còn lại': 'KH_CON_LAI',
        'Năm phân bổ': 'NAM_PHAN_BO', 'CP phân bổ': 'CP_PHAN_BO',   
        'Cấp độ': 'CAP_DO', 'CP CĐ1': 'CP_CD1', 'Thời điểm TH': 'TG_BATDAU',
        'Ghi chú': 'GHI_CHU'
    };
    
    finalHeaders.forEach((h, i) => {
        const key = colNameMap[h];
        if (key) COLS[key] = XLSX.utils.encode_col(i);
    });

    const wb = XLSX.utils.book_new();
    const ws = {}; 
    const moneyFormat = '#,##0';
    const ctx = { ws, currentRow: 1, COLS, execHeaderMap, moneyFormat, summaryData };

    finalHeaders.forEach((h, i) => {
        const cellAddress = XLSX.utils.encode_cell({ c: i, r: 0 });
        ws[cellAddress] = { t: 's', v: h };
    });
    
    const parents = Object.keys(parentsData).map(id => ({ id, ...parentsData[id] })).sort((a,b) => a.id.localeCompare(b.id));
    ctx.currentRow = 2; 

    for (const p of parents) {
        processNodeForExcel(p, `${getParentCollectionName()}/${p.id}`, 0, ctx);
        ctx.currentRow++; 
    }
    
    const range = { s: { c: 0, r: 0 }, e: { c: finalHeaders.length - 1, r: ctx.currentRow - 1 } };
    ws['!ref'] = XLSX.utils.encode_range(range);

    return { wb, ws, finalHeaders };
}

// Helper cho generateWorksheetWithFormulas 
     
	function processNodeForExcel(node, path, level, ctx) {
    const r = ctx.currentRow;
    const isL5 = path.includes('/greatGreatGrandchildren/');
    const isL4 = path.includes('/greatGrandchildren/') && !isL5;
    const isL3 = path.includes('/grandchildren/') && !path.includes('/greatGrandchildren/');
    const isL2 = path.includes('/children/') && !path.includes('/grandchildren/');
    let childRows = [];
    let justificationRows = [];

    const hasL5Children = node.greatGreatGrandchildren && Object.keys(node.greatGreatGrandchildren).length > 0;
    const hasL4Children = node.greatGrandchildren && Object.keys(node.greatGrandchildren).length > 0;
    const hasL3Children = node.grandchildren && Object.keys(node.grandchildren).length > 0;
    const hasL2Children = node.children && Object.keys(node.children).length > 0;
    let isContainer = (node.hasChildren === true) || hasL2Children || hasL3Children || hasL4Children || hasL5Children;

    // Duyệt con cái
    if (node.children) {
        const children = Object.keys(node.children).map(id => ({ id, ...node.children[id] })).sort(childSort);
        for (const childData of children) {
            ctx.currentRow++;
            childRows.push(...processNodeForExcel(childData, `${path}/children/${childData.id}`, level + 1, ctx));
        }
    }
    if (node.grandchildren) {
        const grandchildren = Object.keys(node.grandchildren).map(id => ({ id, ...node.grandchildren[id] })).sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
        for (const grandchildData of grandchildren) {
            ctx.currentRow++;
            childRows.push(...processNodeForExcel(grandchildData, `${path}/grandchildren/${grandchildData.id}`, level + 2, ctx));
        }
    }
    if (node.greatGrandchildren) {
        const greatGrandchildren = Object.keys(node.greatGrandchildren).map(id => ({ id, ...node.greatGrandchildren[id] })).sort(numericSort);
        for (const greatGrandchildData of greatGrandchildren) {
            ctx.currentRow++;
            childRows.push(...processNodeForExcel(greatGrandchildData, `${path}/greatGrandchildren/${greatGrandchildData.id}`, level + 3, ctx));
        }
    }
    if (node.greatGreatGrandchildren) {
        const greatGreatGrandchildren = Object.keys(node.greatGreatGrandchildren).map(id => ({ id, ...node.greatGreatGrandchildren[id] })).sort(numericSort);
        for (const gggcData of greatGreatGrandchildren) {
            ctx.currentRow++;
            childRows.push(...processNodeForExcel(gggcData, `${path}/greatGreatGrandchildren/${gggcData.id}`, level + 4, ctx));
        }
    }

    // Duyệt giải trình
    if (node.justifications && activeExportType === 'full') {
        const justifications = Object.keys(node.justifications).map(id => ({ id, ...node.justifications[id] }))
            .sort((a, b) => String(a.tt || '').localeCompare(String(b.tt || ''), undefined, { numeric: true, sensitivity: 'base' }));
        for (const justData of justifications) {
            ctx.currentRow++;
            justificationRows.push(...processJustificationForExcel(justData, node.tt, level + 5, ctx));
        }
    }

    const safeNum = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        if (typeof val === 'string') return parseFloat(val.replace(/\./g, '').replace(/,/g, '.')) || 0;
        return 0;
    };

    const createSafeSumFormula = (colLetter, rowsArray) => {
        if (!rowsArray || rowsArray.length === 0) return null;
        return rowsArray.map(r => colLetter + r).join('+');
    };

    // Gán dữ liệu cơ bản
    ctx.ws[ctx.COLS.TT + r] = { t: 's', v: convertTTForDisplay(node.tt) };
    ctx.ws[ctx.COLS.NOI_DUNG + r] = { t: 's', v: node.noiDung || '' };
    if (ctx.COLS.TAG_NAME) ctx.ws[ctx.COLS.TAG_NAME + r] = { t: 's', v: isL3 ? (node.tagName || '') : '' };
    ctx.ws[ctx.COLS.DV_THUCHIEN + r] = { t: 's', v: node.dvThucHien || '' };
    ctx.ws[ctx.COLS.DON_VI + r] = { t: 's', v: node.donVi || '' };
    ctx.ws[ctx.COLS.TAN_SUAT + r] = { t: 'n', v: safeNum(node.tanSuatTH) };
    ctx.ws[ctx.COLS.NAM_PHAN_BO + r] = { t: 'n', v: safeNum(node.namPhanBo) };
    ctx.ws[ctx.COLS.CAP_DO + r] = { t: 's', v: node.capDo || '' };

    let tgBatDauValue = node.tgBatDau || '';
    if (level === 0 && ctx.summaryData && ctx.summaryData[node.id]) tgBatDauValue = ctx.summaryData[node.id].totalExecutedLeafNodesCap1 || 0;
    if (ctx.COLS.TG_BATDAU) ctx.ws[ctx.COLS.TG_BATDAU + r] = { t: 's', v: tgBatDauValue };
    if (ctx.COLS.GHI_CHU) ctx.ws[ctx.COLS.GHI_CHU + r] = { t: 's', v: node.ghiChu || '' };
    if (ctx.COLS.DON_GIA) ctx.ws[ctx.COLS.DON_GIA + r] = { t: 'n', v: !isContainer ? safeNum(node.donGia) : 0, s: { numFmt: ctx.moneyFormat } };
   // if (activeExportType === 'full') ctx.ws[ctx.COLS.TG_HOANTHANH + r] = { t: 's', v: node.tgHoanThanh || '' };

    let slValue = 0;
    if (level === 0 && ctx.summaryData && ctx.summaryData[node.id]) slValue = ctx.summaryData[node.id].totalLeafNodesCap1 || 0;
    else if (!isContainer) slValue = safeNum(node.soLuong);
    ctx.ws[ctx.COLS.SO_LUONG + r] = { t: 'n', v: slValue, s: { numFmt: ctx.moneyFormat } };

    // --- XỬ LÝ SUM & CÔNG THỨC ---
    const sumFields = [
        { key: 'khNamTruoc', col: ctx.COLS.KH_NAM_TRUOC }, { key: 'thucHienNamTruoc', col: ctx.COLS.TH_NAM_TRUOC },
        { key: 'chiPhi', col: ctx.COLS.CHI_PHI }, { key: 'chiPhiThucHien', col: ctx.COLS.CHI_PHI_THUCHIEN },
        { key: 'chiPhiPhanBo', col: ctx.COLS.CP_PHAN_BO }, { key: 'cpCap1', col: ctx.COLS.CP_CD1 }
    ];

    for (const field of sumFields) {
        if (!field.col) continue;
        const cellAddress = field.col + r;
        const cellValue = safeNum(node[field.key]);

        if (field.key === 'cpCap1') {
            if (isL4) {
                const chiPhiAddr = ctx.COLS.CHI_PHI + r;
                const capDoAddr = ctx.COLS.CAP_DO + r;
                const formula = `IF(${capDoAddr}="1", ${chiPhiAddr}, IF(${capDoAddr}="6t", ${chiPhiAddr}*0.5, 0))`;
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, f: formula, s: { numFmt: ctx.moneyFormat } };
            } else if ((isL3 || isL2 || level === 0) && isContainer && childRows.length > 0) {
                const sumF = createSafeSumFormula(field.col, childRows);
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, f: sumF, s: { numFmt: ctx.moneyFormat } };
            } else {
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, s: { numFmt: ctx.moneyFormat } };
            }
        } else if (field.key === 'chiPhiPhanBo') {
            if (isL4) {
                const chiPhiAddr = ctx.COLS.CHI_PHI + r;
                const namPbAddr = ctx.COLS.NAM_PHAN_BO + r;
                const formula = `IF(ISNUMBER(${namPbAddr}), IF(${namPbAddr}>0, ${chiPhiAddr}/${namPbAddr}, 0), 0)`;
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, f: formula, s: { numFmt: ctx.moneyFormat } };
            } else if ((isL3 || isL2 || level === 0) && isContainer && childRows.length > 0) {
                const sumF = createSafeSumFormula(field.col, childRows);
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, f: sumF, s: { numFmt: ctx.moneyFormat } };
            } else {
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, s: { numFmt: ctx.moneyFormat } };
            }
        } else if (field.key === 'chiPhi') {
            if ((level === 0 || isL2 || isL3) && isContainer && childRows.length > 0) { // Bổ sung isL3 để Cấp 3 (Grandchild) được cộng dồn
                const sumF = createSafeSumFormula(field.col, childRows);
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, f: sumF, s: { numFmt: ctx.moneyFormat } };
            } else if (justificationRows.length > 0) {
                const sumF = createSafeSumFormula(ctx.COLS.CHI_PHI, justificationRows);
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, f: sumF, s: { numFmt: ctx.moneyFormat } };
            } else {
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, s: { numFmt: ctx.moneyFormat } };
            }
        } else {
            if (isContainer && childRows.length > 0) {
                const sumF = createSafeSumFormula(field.col, childRows);
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, f: sumF, s: { numFmt: ctx.moneyFormat } };
            } else {
                ctx.ws[cellAddress] = { t: 'n', v: cellValue, s: { numFmt: ctx.moneyFormat } };
            }
        }
    }

    // [LOGIC PS] Kế hoạch còn lại
    const chiPhiAddr = ctx.COLS.CHI_PHI + r;
    const chiPhiThucHienAddr = ctx.COLS.CHI_PHI_THUCHIEN + r;
    const capDoAddr = ctx.COLS.CAP_DO + r; 

    if (isL5) {
        ctx.ws[ctx.COLS.KH_CON_LAI + r] = { t: 'n', v: 0, s: { numFmt: ctx.moneyFormat } };
    } else {
        const val = safeNum(node.chiPhi) - safeNum(node.chiPhiThucHien);
        // CÔNG THỨC: Nếu cấp độ là PS hoặc ps thì 0, ngược lại thì trừ bình thường
        const formula = `IF(OR(${capDoAddr}="ps", ${capDoAddr}="PS"), 0, ${chiPhiAddr}-${chiPhiThucHienAddr})`;
        
        ctx.ws[ctx.COLS.KH_CON_LAI + r] = {
            t: 'n',
            v: val,
            f: formula,
            s: { numFmt: ctx.moneyFormat }
        };
    }

    if (node.executions && !isContainer) {
        const sortedExecs = Object.values(node.executions).sort((a, b) => {
            const timeA = a.timestamp || new Date(a.ngayThucHien).getTime() || 0;
            const timeB = b.timestamp || new Date(b.ngayThucHien).getTime() || 0;
            return timeA - timeB;
        });
        sortedExecs.forEach((exec, index) => {
            const sequenceNum = index + 1;
            const colMap = ctx.execHeaderMap[sequenceNum];
            if (colMap) {
                if (colMap.ngayTh) ctx.ws[colMap.ngayTh + r] = { t: 's', v: exec.ngayThucHien || '', s: { numFmt: '@' } };
                if (colMap.soLuong) ctx.ws[colMap.soLuong + r] = { t: 'n', v: safeNum(exec.dvt), s: { numFmt: ctx.moneyFormat } };
                if (colMap.donGia) ctx.ws[colMap.donGia + r] = { t: 'n', v: safeNum(exec.donGia), s: { numFmt: ctx.moneyFormat } };
                if (colMap.thanhTien) ctx.ws[colMap.thanhTien + r] = { t: 'n', v: safeNum(exec.thanhTien), s: { numFmt: ctx.moneyFormat } };
                if (activeExportType === 'full') {
                    if (colMap.timestamp) ctx.ws[colMap.timestamp + r] = { t: 's', v: String(exec.timestamp || ''), s: { numFmt: '@' } };
                    if (colMap.hoSoLink) ctx.ws[colMap.hoSoLink + r] = { t: 's', v: exec.hoSoLink || '' };
                }
            }
        });
    }
    return [r];
}

	// Hàm xuất Excel chỉ có công thức, không có định dạng
	window.exportPlainDataExcel = async function() {
        try {
            statusDiv.className = 'success';
            statusDiv.innerText = 'Đang chuẩn bị dữ liệu file Excel...';
            closeAllModals();
            const { wb, ws } = await generateWorksheetWithFormulas();
            XLSX.utils.book_append_sheet(wb, ws, 'Data');
            XLSX.writeFile(wb, `BDSC_${currentYear}_plain.xlsx`);
            statusDiv.innerText = 'Xuất file Excel (có công thức) thành công!';
        } catch (error) {
            console.error("Lỗi khi xuất Excel:", error);
            statusDiv.className = 'error';
            statusDiv.innerText = `Lỗi khi xuất file: ${error.message}`;
        }
    };
   // Hàm xuất file excel có cả công thức và định dạng
	window.exportFFExcel = async function() {
    if (typeof ExcelJS === 'undefined') {
        alert("Thư viện ExcelJS chưa được tải. Vui lòng kiểm tra kết nối mạng.");
        return;
    }

    try {
        statusDiv.className = 'success';
        statusDiv.innerText = 'Đang khởi tạo ExcelJS và tính toán dữ liệu...';
        closeAllModals();

        // --- CÁC HÀM HELPER SẮP XẾP ---
        const romanToInt = (s) => {
            if (!s) return 0;
            const map = {I:1, V:5, X:10, L:50, C:100, D:500, M:1000};
            let res = 0; s = s.toUpperCase();
            for (let i = 0; i < s.length; i++) {
                let v1 = map[s[i]] || 0; let v2 = map[s[i+1]] || 0;
                if (v2 > v1) res -= v1; else res += v1;
            }
            return res;
        };
        const compareChapters = (aObj, bObj) => {
            const a = aObj.tt ? String(aObj.tt) : ""; const b = bObj.tt ? String(bObj.tt) : "";
            const partsA = a.replace(/,/g, '.').split('.'); const partsB = b.replace(/,/g, '.').split('.');
            const len = Math.max(partsA.length, partsB.length);
            for (let i = 0; i < len; i++) {
                if (partsA[i] === undefined) return -1; if (partsB[i] === undefined) return 1;
                // Loại bỏ dấu * trước khi parse số để Excel sắp xếp chuẩn xác
                const strA = partsA[i].replace('*', '');
                const strB = partsB[i].replace('*', '');
                const numA = parseInt(strA, 10); const numB = parseInt(strB, 10);
                if (!isNaN(numA) && !isNaN(numB)) { if (numA !== numB) return numA - numB; } 
                else { if (partsA[i] !== partsB[i]) return partsA[i].localeCompare(partsB[i], undefined, {numeric: true}); }
            }
            return 0;
        };
        const compareRoman = (a, b) => romanToInt(a.tt) - romanToInt(b.tt);

        // 2. Tải Dữ liệu
        const parentRef = ref(db, getParentCollectionName());
        const parentSnapshot = await get(parentRef);
        if (!parentSnapshot.exists()) { alert('Không có dữ liệu.'); statusDiv.innerText = ''; return; }
        const parentsData = parentSnapshot.val();

        const summaryRef = ref(db, `summary_data/${currentYear}`);
        const summarySnap = await get(summaryRef);
        const summaryData = summarySnap.exists() ? summarySnap.val() : {};

        const parents = Object.keys(parentsData).map(id => ({ id, ...parentsData[id] })).sort((a, b) => a.id.localeCompare(b.id));
        
        // Helper tìm max execution
        const findMaxExecutions = (nodes) => {
            let max = 0;
            const traverse = (n) => {
                if (n.executions) { const count = Object.keys(n.executions).length; if (count > max) max = count; }
                if (n.children) Object.values(n.children).forEach(traverse);
                if (n.grandchildren) Object.values(n.grandchildren).forEach(traverse);
                if (n.greatGrandchildren) Object.values(n.greatGrandchildren).forEach(traverse);
                if (n.greatGreatGrandchildren) Object.values(n.greatGreatGrandchildren).forEach(traverse);
            };
            Object.values(nodes).forEach(traverse);
            return max;
        };
        const maxExec = findMaxExecutions(parentsData);

        // 3. Khởi tạo Excel
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(`Kế Hoạch ${currentYear}`, { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });

        // 4. Định nghĩa Cột
        const isFullMode = (activeExportType === 'full');
        const allBaseColumns = [
            { header: 'TT', key: 'tt', width: 10, style: { numFmt: '@' } }, 
            { header: 'Nội dung', key: 'noiDung', width: 50, style: { alignment: { wrapText: true } } },
            { header: 'Tag Name', key: 'tagName', width: 12 },
            { header: 'ĐV th.hiện', key: 'dvThucHien', width: 15 },
            { header: 'KH năm trước', key: 'khNamTruoc', width: 15, style: { numFmt: '#,##0' } },
            { header: 'Thực hiện năm trước', key: 'thucHienNamTruoc', width: 15, style: { numFmt: '#,##0' } },
            { header: 'Tần suất TH', key: 'tanSuatTH', width: 10, style: { alignment: { horizontal: 'center' } } },
            { header: 'Đ.vị tính', key: 'donVi', width: 10, style: { alignment: { horizontal: 'center' } } },
            { header: 'Số lượng', key: 'soLuong', width: 10, style: { numFmt: '#,##0' } },
            { header: 'Đơn giá (GT)', key: 'donGia', width: 15, style: { numFmt: '#,##0' } },
            { header: 'Chi phí KH', key: 'chiPhi', width: 18, style: { numFmt: '#,##0' } },
            { header: 'Chi phí thực hiện', key: 'chiPhiThucHien', width: 18, style: { numFmt: '#,##0' } },
            { header: 'Kế hoạch còn lại', key: 'keHoachConLai', width: 18, style: { numFmt: '#,##0' } },
            { header: 'Năm phân bổ', key: 'namPhanBo', width: 10, style: { alignment: { horizontal: 'center' } } },
            { header: 'CP phân bổ', key: 'chiPhiPhanBo', width: 15, style: { numFmt: '#,##0' } },
            { header: 'Cấp độ', key: 'capDo', width: 8, style: { alignment: { horizontal: 'center' } } },
            { header: 'CP CĐ1', key: 'cpCap1', width: 15, style: { numFmt: '#,##0' } },
            { header: 'Thời điểm TH', key: 'tgBatDau', width: 12 },
        //    { header: 'ODDO', key: 'tgHoanThanh', width: 12, style: { numFmt: '#,##0' } },
            { header: 'Ghi chú', key: 'ghiChu', width: 25 }
        ];
        const columnsToUse = isFullMode ? allBaseColumns : allBaseColumns.filter(c => !['donGia', 'khNamTruoc', 'thucHienNamTruoc'].includes(c.key));
        const activeColumnKeys = new Set(columnsToUse.map(c => c.key));

        for (let i = 1; i <= maxExec; i++) {
            columnsToUse.push(
                { header: `Ngày TH (${i})`, key: `ngayTh_${i}`, width: 12, style: { numFmt: '@' } },
                { header: `Số lượng (${i})`, key: `sl_${i}`, width: 10, style: { numFmt: '#,##0' } },
                { header: `Đơn giá (${i})`, key: `dg_${i}`, width: 15, style: { numFmt: '#,##0' } },
                { header: `Thành tiền (${i})`, key: `tt_${i}`, width: 18, style: { numFmt: '#,##0' } }
            );
            if (isFullMode) {
                columnsToUse.push({ header: `Timestamp (${i})`, key: `ts_${i}`, width: 15, style: { numFmt: '0' } }, { header: `Hồ sơ Link (${i})`, key: `link_${i}`, width: 20 });
            }
        }
        sheet.columns = columnsToUse;
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        // 5. HÀM ĐỆ QUY XỬ LÝ
        const processNodeToExcelJS = (node, level, path) => {
            const isContainer = (node.hasChildren === true) 
                || (node.children && Object.keys(node.children).length > 0)
                || (node.grandchildren && Object.keys(node.grandchildren).length > 0)
                || (node.greatGrandchildren && Object.keys(node.greatGrandchildren).length > 0)
                || (node.greatGreatGrandchildren && Object.keys(node.greatGreatGrandchildren).length > 0);

            let displaySoLuong = node.soLuong;
            let displayTgBatDau = node.tgBatDau;
            if (level === 0 && summaryData[node.id]) {
                displaySoLuong = summaryData[node.id].totalLeafNodesCap1 || 0;
                displayTgBatDau = summaryData[node.id].totalExecutedLeafNodesCap1 || 0;
            }

            const rowValues = {
                tt: node.tt ? String(node.tt).replace(/,/g, '.') : '',
                noiDung: node.noiDung || '', tagName: (level === 2) ? (node.tagName || '') : '', dvThucHien: node.dvThucHien || '',
                khNamTruoc: node.khNamTruoc || 0, thucHienNamTruoc: node.thucHienNamTruoc || 0,
                tanSuatTH: (node.tanSuatTH === 0) ? '-' : (node.tanSuatTH || ''),
                donVi: node.donVi || '',
                soLuong: (isContainer && level === 0) ? displaySoLuong : (node.soLuong || 0),
                donGia: node.donGia || 0, chiPhi: node.chiPhi || 0, chiPhiThucHien: node.chiPhiThucHien || 0,
                keHoachConLai: node.keHoachConLai || 0,
                namPhanBo: node.namPhanBo || '', chiPhiPhanBo: node.chiPhiPhanBo || 0,
                capDo: node.capDo || '', cpCap1: node.cpCap1 || 0,
                tgBatDau: (level === 0) ? displayTgBatDau : (node.tgBatDau || ''),
                ghiChu: node.ghiChu || ''
            };

            // Dữ liệu Executions
            if (node.executions) {
                const sortedExecs = Object.values(node.executions).sort((a, b) => {
                    const timeA = a.timestamp || new Date(a.ngayThucHien).getTime() || 0;
                    const timeB = b.timestamp || new Date(b.ngayThucHien).getTime() || 0;
                    return timeA - timeB;
                });
                sortedExecs.forEach((exec, index) => {
                    const colIndex = index + 1;
                    if (colIndex <= maxExec) {
                        rowValues[`ngayTh_${colIndex}`] = exec.ngayThucHien; 
                        rowValues[`sl_${colIndex}`] = exec.dvt;
                        rowValues[`dg_${colIndex}`] = exec.donGia; 
                        rowValues[`tt_${colIndex}`] = exec.thanhTien;
                        if (isFullMode) { 
                            rowValues[`ts_${colIndex}`] = exec.timestamp ? String(exec.timestamp) : ''; 
                            rowValues[`link_${colIndex}`] = exec.hoSoLink; 
                        }
                    }
                });
            }

            const row = sheet.addRow(rowValues);
            const rIdx = row.number;
            const childRowNumbers = [];
            const justificationRowNumbers = [];

            // --- XỬ LÝ CON ---
            if (node.children) {
                Object.values(node.children).sort(compareRoman).forEach(c => childRowNumbers.push(...processNodeToExcelJS(c, level + 1, `${path}/children/${c.id}`)));
            }
            if (node.grandchildren) {
                Object.values(node.grandchildren).sort(compareChapters).forEach(c => childRowNumbers.push(...processNodeToExcelJS(c, level + 1, `${path}/grandchildren/${c.id}`)));
            }
            if (node.greatGrandchildren) {
                Object.values(node.greatGrandchildren).sort(compareChapters).forEach(c => childRowNumbers.push(...processNodeToExcelJS(c, level + 1, `${path}/greatGrandchildren/${c.id}`)));
            }
            if (node.greatGreatGrandchildren) {
                Object.values(node.greatGreatGrandchildren).sort(compareChapters).forEach(c => childRowNumbers.push(...processNodeToExcelJS(c, level + 1, `${path}/greatGreatGrandchildren/${c.id}`)));
            }

            // --- XỬ LÝ GIẢI TRÌNH ---
            if (isFullMode && node.justifications) {
                Object.values(node.justifications).sort(compareChapters).forEach(j => {
                    const jRow = sheet.addRow({
                        tt: j.tt ? String(j.tt).replace(/,/g, '.') : '', noiDung: j.noiDung, donVi: j.donVi, soLuong: j.soLuong, donGia: j.donGia, chiPhi: j.chiPhi, ghiChu: j.ghiChu
                    });
                    jRow.font = { italic: true, color: { argb: 'FFFF0000' } };
                    if(activeColumnKeys.has('chiPhi')) jRow.getCell('chiPhi').numFmt = '#,##0';
                    
                    const subJustRowNumbers = [];
                    if (j.subJustifications) {
                        Object.values(j.subJustifications).sort(compareChapters).forEach(s => {
                            const sRow = sheet.addRow({ tt: s.tt ? String(s.tt).replace(/,/g, '.') : '', noiDung: s.noiDung, donVi: s.donVi, soLuong: s.soLuong, donGia: s.donGia, chiPhi: s.chiPhi, ghiChu: s.ghiChu });
                            sRow.font = { italic: true, color: { argb: 'FF800000' } };
                            if(activeColumnKeys.has('chiPhi')) sRow.getCell('chiPhi').numFmt = '#,##0';
                            subJustRowNumbers.push(sRow.number);
                        });
                        if (subJustRowNumbers.length > 0 && activeColumnKeys.has('chiPhi')) {
                            jRow.getCell('chiPhi').value = { formula: subJustRowNumbers.map(r => sheet.getRow(r).getCell('chiPhi').address).join('+') };
                        }
                    }
                    justificationRowNumbers.push(jRow.number);
                });
            }

            // =================================================================
            // TẠO CÔNG THỨC EXCEL
            // =================================================================
            
            // 1. Kế hoạch còn lại (Trừ level 5 VÀ Trừ task có capDo = PS)
            if (activeColumnKeys.has('chiPhi') && activeColumnKeys.has('chiPhiThucHien') && activeColumnKeys.has('keHoachConLai')) {
                // Kiểm tra xem Cấp độ có phải là PS không
                const isPs = node.capDo && String(node.capDo).trim().toLowerCase() === 'ps';

                if (level !== 4 && !isPs) { // Level 5 = 4. Nếu không phải Level 5 VÀ không phải PS thì mới tạo công thức
                    const cellChiPhi = row.getCell('chiPhi').address;
                    const cellChiPhiTH = row.getCell('chiPhiThucHien').address;
                    row.getCell('keHoachConLai').value = { formula: `${cellChiPhi}-${cellChiPhiTH}` };
                } else {
                    // Nếu là Level 5 HOẶC là PS -> Xóa trắng
                    row.getCell('keHoachConLai').value = null; 
                }
            }

            // 2. Tổng hợp từ con (Container)
            if (isContainer && childRowNumbers.length > 0) {
                const makeSum = (key) => {
                    if (!activeColumnKeys.has(key)) return;
                    if (key === 'chiPhi' && level >= 3) return; // Cho phép Level 3 cộng dồn, chỉ chặn từ Level 5 lên Level 4
                    if ((key === 'chiPhiPhanBo' || key === 'cpCap1') && level >= 3) return;

                    const cells = childRowNumbers.map(r => sheet.getRow(r).getCell(key).address).join('+');
                    if (cells.length > 8000) return;
                    row.getCell(key).value = { formula: cells };
                };
                
                makeSum('chiPhi');
                makeSum('chiPhiThucHien'); 
                makeSum('khNamTruoc'); makeSum('thucHienNamTruoc');
                makeSum('chiPhiPhanBo'); 
                makeSum('cpCap1');
            }

            // 3. Tổng hợp từ Giải trình hoặc gán Thành tiền cho các Node lá
            if (justificationRowNumbers.length > 0 && activeColumnKeys.has('chiPhi')) {
                 // Nếu Level 4 có giải trình -> Cộng các giải trình
                 const cells = justificationRowNumbers.map(r => sheet.getRow(r).getCell('chiPhi').address).join('+');
                 row.getCell('chiPhi').value = { formula: cells };
            }
            else if (!isContainer) { 
                if (activeColumnKeys.has('soLuong') && activeColumnKeys.has('donGia')) {
                    if ((node.soLuong || 0) !== 0 || (node.donGia || 0) !== 0) {
                        const addrSL = row.getCell('soLuong').address; 
                        const addrDG = row.getCell('donGia').address;
                        
                        // [SỬA LỖI]: Phân biệt rõ Cấp 4 và Cấp 5
                        if (level === 4) { 
                            // NẾU LÀ LEVEL 5 (Biến level = 4):
                            // Đặt công thức tính Thành tiền (SL*DG) vào cột CHI PHÍ THỰC HIỆN
                            if (activeColumnKeys.has('chiPhiThucHien')) {
                                row.getCell('chiPhiThucHien').value = { formula: `${addrSL}*${addrDG}` };
                            }
                            // Làm rỗng cột Chi phí KH vì Level 5 không có KH
                            if (activeColumnKeys.has('chiPhi')) {
                                row.getCell('chiPhi').value = null; 
                            }
                        } else {
                            // NẾU LÀ LEVEL 4 KHÔNG CÓ GIẢI TRÌNH (hoặc lá cấp khác):
                            // KHÔNG ghi đè công thức vào cột Chi phí KH nữa. 
                            // Hệ thống sẽ tự động sử dụng giá trị số gốc lấy từ CSDL đã nạp ở biến rowValues.
                        }
                    }
                }
            }
            
            // 4. Công thức cho Level 4 & 5 (Level >= 3)
            if (level >= 3) {
                if (activeColumnKeys.has('chiPhi') && activeColumnKeys.has('namPhanBo') && activeColumnKeys.has('chiPhiPhanBo')) {
                    const addrChiPhi = row.getCell('chiPhi').address; const addrNamPB = row.getCell('namPhanBo').address;
                    row.getCell('chiPhiPhanBo').value = { formula: `IF(ISNUMBER(${addrNamPB}), IF(${addrNamPB}>0, ${addrChiPhi}/${addrNamPB}, 0), 0)` };
                }
                if (activeColumnKeys.has('chiPhi') && activeColumnKeys.has('capDo') && activeColumnKeys.has('cpCap1')) {
                    const addrChiPhi = row.getCell('chiPhi').address; const addrCapDo = row.getCell('capDo').address;
                    row.getCell('cpCap1').value = { formula: `IF(${addrCapDo}="1", ${addrChiPhi}, IF(${addrCapDo}="6t", ${addrChiPhi}*0.5, 0))` };
                }
            }

            // Style & Định dạng
            const colors = ['FFC5D9F1', 'FFE4DFEC', 'FFF2DCDB', 'FFEBF1DE', 'FFFFFFFF', 'FFFFE599']; 
            const bgColor = colors[level] || 'FFFFFFFF'; 
            const isBold = level < 3;

            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                cell.border = { top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, left: { style: 'thin', color: { argb: 'FFD9D9D9' } }, bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } }, right: { style: 'thin', color: { argb: 'FFD9D9D9' } } };
                if (isBold) cell.font = { bold: true };
            });
            return [rIdx];
        };

        parents.forEach(p => processNodeToExcelJS(p, 0, `${getParentCollectionName()}/${p.id}`));

        const buffer = await workbook.xlsx.writeBuffer();
        const fileName = isFullMode ? `KeHoach_Full_${currentYear}.xlsx` : `KeHoach_Simple_${currentYear}.xlsx`;
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fileName;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);

        statusDiv.innerText = 'Xuất Excel thành công!'; setTimeout(() => statusDiv.innerText = '', 3000);

    } catch (error) {
        console.error("Lỗi xuất ExcelJS:", error); statusDiv.className = 'error'; statusDiv.innerText = `Lỗi: ${error.message}`;
    }
};

  

// HÀM FETCHDATA CHÍNH (cần được định nghĩa sau cùng vì phụ thuộc vào nhiều hàm khác)
// =========================================================================
    // HÀM FETCHDATA (NÂNG CẤP: TREE VIEW CẤP 4 -> CẤP 5)
    // =========================================================================
    window.fetchData = async function() {
        const tableBody = document.getElementById('taskListBody'); 
        const statusDiv = document.getElementById('status');
        
        if (!tableBody) return;
        const scrollPosition = window.scrollY;

        // KIỂM TRA CHẾ ĐỘ PLANNING
        const isPlanningMode = document.body.classList.contains('planning-mode');

        try {
            await ensureYearCollectionExists(currentYear);
            
            const hoSoLinksMap = new Map();
            const collectionName = getParentCollectionName();
            const parentSnapshot = await get(ref(db, collectionName));
            
            if (!parentSnapshot.exists()) {
                tableBody.innerHTML = `<tr><td colspan="17" style="text-align: center;">Không có dữ liệu cho năm ${currentYear}.</td></tr>`;
                if(statusDiv) statusDiv.innerText = '';
                
                // --- BẮT ĐẦU BỔ SUNG: RESET BẢNG SUMMARY VỀ 0 ---
                const emptySummaryHtml = `
                    <button class="btn-info" style="position: absolute; top: 10px; right: 10px; padding: 5px 10px; font-size: 14px;" onclick="openSummaryDetailModal()">Xem chi tiết các đơn vị</button>
                    <div class="summary-column">
                        <p><strong>Tổng số đầu việc chi tiết trong kế hoạch:</strong> 0</p>
                        <p><strong>Tổng số đầu việc cấp độ 1 cần thực hiện:</strong> 0</p>
                        <p><strong>Tổng chi phí theo kế hoạch:</strong> 0</p>
                    </div>
                    <div class="summary-column">
                        <p><strong>Số đầu việc chi tiết đã thực hiện:</strong> 0 <span class="percentage">(0%)</span></p>
                        <p><strong>Số đầu việc cấp độ 1 đã thực hiện:</strong> 0 <span class="percentage">(0%)</span></p>
                        <p><strong>Tổng chi phí đã thực hiện:</strong> 0 <span class="percentage">(0%)</span></p>
                    </div>`;
                if(document.getElementById('summarySection')) {
                    document.getElementById('summarySection').innerHTML = emptySummaryHtml;
                }
                // --- KẾT THÚC BỔ SUNG ---

                return;
            }

            // ... (Logic xử lý Link hồ sơ giữ nguyên) ...
            const processNodeForLinks = (node, path) => {
                if (node.executions) {
                    for (const execId in node.executions) {
                        const exec = node.executions[execId];
                        if (exec.hoSoLink) {
                            if (!hoSoLinksMap.has(path)) hoSoLinksMap.set(path, new Set());
                            hoSoLinksMap.get(path).add(exec.hoSoLink);
                        }
                    }
                }
                if (node.children) for (const k in node.children) processNodeForLinks(node.children[k], `${path}/children/${k}`);
                if (node.grandchildren) for (const k in node.grandchildren) processNodeForLinks(node.grandchildren[k], `${path}/grandchildren/${k}`);
                if (node.greatGrandchildren) for (const k in node.greatGrandchildren) processNodeForLinks(node.greatGrandchildren[k], `${path}/greatGrandchildren/${k}`);
                if (node.greatGreatGrandchildren) for (const k in node.greatGreatGrandchildren) processNodeForLinks(node.greatGreatGrandchildren[k], `${path}/greatGreatGrandchildren/${k}`);
            };
            const parentsData = parentSnapshot.val();
            for (const parentId in parentsData) processNodeForLinks(parentsData[parentId], `${collectionName}/${parentId}`);

            const summaryRef = ref(db, `summary_data/${currentYear}`);
            const summarySnap = await get(summaryRef);
            const summaryData = summarySnap.exists() ? summarySnap.val() : {};

            let html = '';
            let totalPlannedCost = 0, totalExecutedCost = 0;
            
            docDataMap.clear();
            if (typeof parentNoiDungMap !== 'undefined') parentNoiDungMap.clear();

            const parents = Object.keys(parentsData).map(id => ({ id, ...parentsData[id] }));
            parents.sort((a, b) => a.id.localeCompare(b.id));

            // =========================================================================
            // 1. HÀM TẠO HTML (QUẢN LÝ ẨN/HIỆN MENU)
            // =========================================================================
            const createRowHtml = (itemClass, path, data, extraAttributes = '') => {
    
    // [CSS] Giữ nguyên CSS ẩn hiện các nút hành động
    if (!document.getElementById('dynamic-action-styles')) {
        const style = document.createElement('style');
        style.id = 'dynamic-action-styles';
        style.innerHTML = `
            #taskList:not(.planning-mode) tr.task-parent .col-action .dropdown,
            #taskList:not(.planning-mode) tr.task-child .col-action .dropdown,
            #taskList:not(.planning-mode) tr.task-great-great-grandchild .col-action .dropdown {
                display: none !important;
            }
            #taskList:not(.planning-mode) .btn-add-justification {
                display: none !important;
            }
                    /* --- BỔ SUNG CSS RẼ NHÁNH CHO NÚT LEVEL 4 --- */
            
            /* 1. MẶC ĐỊNH (View Mode): Ẩn Dropdown, Hiện nút Sửa */
            .dropdown-planning-only { display: none !important; }
            .btn-view-mode-only { display: inline-block !important; }
            
            /* 2. KHI BẬT PLANNING MODE: Ghi đè để Hiện Dropdown, Ẩn nút Sửa */
            .planning-mode .dropdown-planning-only { display: inline-block !important; }
            .planning-mode .btn-view-mode-only { display: none !important; }
            /* --- BỔ SUNG CSS ĐỔI TÊN NÚT CẤP 3 --- */
            
            /* Mặc định (View mode): Hiện chữ Xử lý, Ẩn chữ Thêm/Sửa */
            .text-planning-mode { display: none; }
            .text-view-mode { display: inline; }
            
            /* Khi bật Planning mode: Đảo ngược lại */
            .planning-mode .text-planning-mode { display: inline; }
            .planning-mode .text-view-mode { display: none; }
            
            /* ------------------------------------------- */
    
			
			/* CSS cho Select tối giản */
            .compact-select {
                appearance: none; -webkit-appearance: none; -moz-appearance: none;
                background: transparent; border: none; cursor: pointer;
                font-size: 16px; width: 100%; text-align: center;
                padding: 0; margin: 0;
            }
            .compact-select:focus { outline: none; }
            .compact-select option { font-size: 14px; padding: 5px; }
        `;
        document.head.appendChild(style);
    }

    // 1. Xác định Level
    let levelName = 'child';
    if (itemClass.includes('task-parent')) levelName = 'parent';
    else if (itemClass.includes('task-child')) levelName = 'child';
    else if (itemClass.includes('task-grandchild')) levelName = 'grandchild';
    else if (itemClass.includes('task-great-grandchild')) levelName = 'greatGrandchild';
    else if (itemClass.includes('task-great-great-grandchild')) levelName = 'greatGreatGrandchild';

    const isParentLeaf = itemClass.includes('is-parent-leaf');
    const isCheckbox = !itemClass.includes('task-parent');

    // =========================================================================
    // XỬ LÝ NÚT HỒ SƠ
    // =========================================================================
    let hoSoBtn = '';

    // --- LOGIC 1: BẢO TỒN NÚT "Có" (Logic gốc) ---
    // Kiểm tra nếu node hiện tại có link (thông qua Map hoặc check trực tiếp)
    if (typeof hoSoLinksMap !== 'undefined') {
        const links = hoSoLinksMap.get(path);
        if (links && links.size > 0) {
            const linksJson = JSON.stringify(Array.from(links));
            // Giữ nguyên nút "Có" như bạn mong muốn
            hoSoBtn = `<button class="btn-info btn-action" data-links='${linksJson}' onclick="showLinks(event)">Có</button>`;
        }
    }

    // --- LOGIC 2: CẢI TIẾN RIÊNG CHO LEVEL 4 CÓ CON LEVEL 5 ---
    if (levelName === 'greatGrandchild' && data.greatGreatGrandchildren) {
        const uniqueMap = new Map();

        // Gom link từ Level 5
        Object.values(data.greatGreatGrandchildren).forEach(l5 => {
            if (l5.executions) {
                Object.values(l5.executions).forEach(ex => {
                    const rawLink = ex.hoSoLink ? ex.hoSoLink.trim() : '';
                    if (rawLink !== '') {
                        // Lọc trùng: Chỉ lấy link đầu tiên gặp
                        if (!uniqueMap.has(rawLink)) {
                            uniqueMap.set(rawLink, {
                                link: rawLink,
                                name: l5.noiDung || 'Chi tiết' // Tên để hiển thị trong list
                            });
                        }
                    }
                });
            }
        });

        const finalLinks = Array.from(uniqueMap.values());

        // Nếu có link từ cấp con -> GHI ĐÈ nút hoSoBtn bằng Dropdown biểu tượng
        if (finalLinks.length > 0) {
            let options = `<option value="" disabled selected>📂</option>`; // Chỉ hiện icon Folder
            
            finalLinks.forEach(item => {
                // Option chỉ hiện tên Task (hoặc ngày tháng nếu muốn), không cần tiêu đề rườm rà
                const shortName = item.name.length > 30 ? item.name.substring(0, 30) + '...' : item.name;
                options += `<option value="${item.link}">• ${shortName}</option>`;
            });

            // HTML cực gọn: Một thẻ select trong suốt, chỉ hiện icon 📂
            hoSoBtn = `
                <div style="width: 30px; margin: 0 auto; overflow: hidden;" title="Có ${finalLinks.length} hồ sơ chi tiết">
                    <select class="compact-select" 
                            onchange="if(this.value) window.open(this.value, '_blank'); this.selectedIndex=0;"
                            onclick="event.stopPropagation();">
                        ${options}
                    </select>
                </div>
            `;
        }
    }

    // =========================================================================

   // const noiDungStyle = (data.chiPhiThucHien > 0) ? 'style="color: #5B77A8;"' : '';
   const noiDungStyle = (data.daThucHien === true) ? 'style="color: #5B77A8;"' : '';
   
    // [BẮT ĐẦU SỬA]: Logic ẩn/hiện Tần suất
    let shouldShowTanSuat = true;
    if (levelName === 'parent' || levelName === 'child') {
        shouldShowTanSuat = false; // Cấp 1, 2: Ẩn
    } else if (levelName === 'grandchild') {
        // Cấp 3: Kiểm tra xem có chứa Cấp 4 không (Nếu có thì nó là Container -> Ẩn)
        const hasL4Children = data.greatGrandchildren && Object.keys(data.greatGrandchildren).length > 0;
        if (hasL4Children || data.hasChildren) {
            shouldShowTanSuat = false;
        }
    }
    const displayTanSuat = shouldShowTanSuat ? ((data.tanSuatTH === 0) ? '-' : (data.tanSuatTH || '')) : '';
    const tanSuatEditableClass = shouldShowTanSuat ? 'editable-cell' : '';
    // [KẾT THÚC SỬA]

    const tagNameDisplay = levelName === 'grandchild' ? (data.tagName || '') : '';

    let noiDungDisplay = data.noiDung;
    if (levelName === 'greatGrandchild' && data.hasChildren) {
        noiDungDisplay = `<span class="tree-toggle-icon" onclick="toggleLevel5(event, '${path}')">▶</span>` + noiDungDisplay;
    }

    const getActions = (lvl, p) => {
        if (lvl === 'parent') return `<a href="javascript:void(0)" onclick="openAddModal('${p}', 'child')">Thêm Hệ thống/Hạng mục vào danh sách</a>`;
        if (lvl === 'child') return `<a href="javascript:void(0)" onclick="openAddModal('${p}', 'grandchild')">Thêm Thiết bị/Cụm TB</a>`;
        if (lvl === 'grandchild') return `<a href="javascript:void(0)" onclick="openAddModal('${p}', 'greatGrandchild')">Thêm công việc</a>`;
        
        if (lvl === 'greatGrandchild') {
        //    let links = `<a href="javascript:void(0)" onclick="openAddModal('${p}', 'greatGreatGrandchild')">Kê khai vật tư thực hiện CV</a>`;
        //    links += `<a href="javascript:void(0)" onclick="openAddModal('${p}', 'justification')" class="btn-add-justification">Thêm giải trình</a>`;
            let links =`<a href="javascript:void(0)" onclick="openAddModal('${p}', 'justification')" class="btn-add-justification">Thêm giải trình</a>`;
			
			return links;
        }
        if (lvl === 'greatGreatGrandchild') {
            return ''; // Không cho phép tạo giải trình ở Cấp 5
        }
        return '';
    };

    let actionHtml = '';
    
    if (levelName === 'greatGrandchild') {
        actionHtml = `
            <button class="btn-secondary btn-action btn-view-mode-only" onclick="handleEditClick('${path}', '${levelName}')">Sửa</button>
            
            <div class="dropdown dropdown-planning-only">
                <button onclick="toggleDropdown(event)" class="btn-secondary btn-action dropbtn">Thêm/Sửa</button>
                <div class="dropdown-content">
                    ${getActions(levelName, path)}
                    <a href="javascript:void(0)" onclick="handleEditClick('${path}', '${levelName}')">Sửa nội dung</a>
                </div>
            </div>
        `;
    } 
else if (levelName === 'grandchild') {
        // Thêm pointer-events: none để cú click xuyên qua span, bắt thẳng vào button
        actionHtml = `
            <div class="dropdown">
                <button onclick="toggleDropdown(event)" class="btn-secondary btn-action dropbtn">
                    <span class="text-view-mode" style="pointer-events: none;">Thêm /Sửa</span>
                    <span class="text-planning-mode" style="pointer-events: none;">Thêm/Sửa</span>
                </button>
                <div class="dropdown-content">
                    ${getActions(levelName, path)}
                    <a href="javascript:void(0)" onclick="handleEditClick('${path}', '${levelName}')">Sửa nội dung</a>
                </div>
            </div>
        `;
    }
else {
        // Đối với các cấp 1, 2, 3 thì giữ nguyên Dropdown gốc
        actionHtml = `
            <div class="dropdown">
                <button onclick="toggleDropdown(event)" class="btn-secondary btn-action dropbtn">Thêm/Sửa</button>
                <div class="dropdown-content">
                    ${getActions(levelName, path)}
                    <a href="javascript:void(0)" onclick="handleEditClick('${path}', '${levelName}')">Sửa nội dung</a>
                </div>
            </div>
        `;
    }


    return `<tr class="${itemClass}" data-main-parent="${path.split('/')[1]}" data-path="${path}" ${extraAttributes}>
        <td>${isCheckbox ? `<input type="checkbox" class="${isParentLeaf ? 'parent-checkbox' : 'task-checkbox'}" data-path="${path}" onchange="${isParentLeaf ? 'toggleChildrenCheckboxes(this)' : 'toggleSelection(this)'}">` : ''}</td>
        <td class="col-tt" ${levelName === 'greatGrandchild' && data.hasChildren ? `ondblclick="toggleLevel5(event, '${path}')" style="cursor:pointer;"` : ''}>${convertTTForDisplay(data.tt)}</td>
        <td class="col-noidung" ${noiDungStyle} ${levelName === 'greatGrandchild' && data.hasChildren ? `ondblclick="toggleLevel5(event, '${path}')" style="cursor:pointer;"` : ''}>${noiDungDisplay}</td>
       <td class="col-tagname ${levelName === 'grandchild' ? 'editable-cell' : ''}" data-field="tagName">${tagNameDisplay}</td>
        <td class="col-dv-thuchien editable-cell" data-field="dvThucHien">${data.dvThucHien || ''}</td>
        <td class="text-right col-kh-nam-truoc">${formatNumber(data.khNamTruoc)}</td>
        <td class="text-right col-th-nam-truoc editable-cell" data-field="thucHienNamTruoc">${formatNumber(data.thucHienNamTruoc)}</td>
        <td class="col-donvi editable-cell" data-field="donVi">${data.donVi || ''}</td>
        <td class="col-soluong">${data.soLuong || ''}</td>
        <td class="col-tansuat-th ${tanSuatEditableClass}" data-field="tanSuatTH" style="text-align: center;">${displayTanSuat}</td>
        <td class="text-right col-chiphi">${formatNumber(data.chiPhi)}</td>
        <td class="text-right col-chiphi-thuchien">${formatNumber(data.chiPhiThucHien)}</td>
        <td class="text-right col-kehoach-conlai">${formatNumber(data.keHoachConLai)}</td>
        <td class="col-nam-phanbo editable-cell" data-field="namPhanBo">${data.namPhanBo || ''}</td>
        <td class="col-chiphi-phanbo">${formatNumber(data.chiPhiPhanBo)}</td>
        <td class="col-capdo editable-cell" data-field="capDo">${data.capDo || ''}</td>
        <td class="col-cp-cap1 text-right">${levelName === 'greatGreatGrandchild' ? '' : formatNumber(data.cpCap1)}</td>
        <td class="col-tg-batdau editable-cell ${levelName === 'greatGrandchild' && data.quaHan ? 'overdue-cell' : ''}" data-field="tgBatDau" ${levelName === 'greatGrandchild' && data.quaHan ? 'data-tooltip="Công việc đã quá hạn"' : ''}>${data.tgBatDau || ''}</td>
        <td class="col-tg-hoanthanh editable-cell" data-field="tgHoanThanh" style="text-align: right;">${itemClass.includes('task-great-grandchild') ? formatNumber(data.tgHoanThanh) : ''}</td>
        <td class="col-ghichu editable-cell" data-field="ghiChu">${data.ghiChu || ''}</td>
        <td class="col-hoso" style="text-align: center; padding: 0;">${hoSoBtn}</td>
        <td class="col-action">${actionHtml}</td>
    </tr>`;
};

            for (const parentData of parents) {
                if (typeof parentNoiDungMap !== 'undefined') parentNoiDungMap.set(parentData.id, parentData.noiDung);
                var mainParentId = parentData.tt;

                const parentSummary = summaryData[parentData.id] || {};
                parentData.soLuong = parentSummary.totalLeafNodesCap1 || 0;
                parentData.tgBatDau = parentSummary.totalExecutedLeafNodesCap1 || 0;

                totalPlannedCost += parentData.chiPhi || 0;
                totalExecutedCost += parentData.chiPhiThucHien || 0;
                const parentPath = `${collectionName}/${parentData.id}`;
                
                html += createRowHtml('task-parent', parentPath, parentData);

                if (parentData.children) {
                    const children = Object.keys(parentData.children).map(id => ({ id, ...parentData.children[id] })).sort(childSort);
                    for (const childData of children) {
                        const childPath = `${parentPath}/children/${childData.id}`;
                        docDataMap.set(childPath, childData);
                        if (!childData.isHidden) html += createRowHtml('task-child', childPath, childData);

                        if (childData.grandchildren) {
                            const grandchildren = Object.keys(childData.grandchildren).map(id => ({ id, ...childData.grandchildren[id] })).sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));
                            for (const grandchildData of grandchildren) {
                                const grandchildPath = `${childPath}/grandchildren/${grandchildData.id}`;
                                docDataMap.set(grandchildPath, grandchildData);
                                html += createRowHtml('task-grandchild', grandchildPath, grandchildData);

                                if (grandchildData.greatGrandchildren) {
                                    const greatGrandchildren = Object.keys(grandchildData.greatGrandchildren).map(id => ({ id, ...grandchildData.greatGrandchildren[id] })).sort(numericSort);
                                    for (const greatGrandchildData of greatGrandchildren) {
                                        const greatGrandchildPath = `${grandchildPath}/greatGrandchildren/${greatGrandchildData.id}`;
                                        docDataMap.set(greatGrandchildPath, greatGrandchildData);
                                        
                                        const isParentLeaf = greatGrandchildData.hasChildren;
                                        
                                        // --- XỬ LÝ CẤP 4 (GreatGrandchild) ---
                                        // Đánh dấu dòng này có con để xử lý hover/click
                                        const extraAttr = isParentLeaf ? 'data-has-children="true"' : '';
                                        const rowClass = `task-great-grandchild ${isParentLeaf ? 'is-parent-leaf' : ''}`;
                                        
                                        html += createRowHtml(rowClass, greatGrandchildPath, greatGrandchildData, extraAttr);

                                        // --- XỬ LÝ GIẢI TRÌNH CHO CẤP 4 ---
                                        if (greatGrandchildData.justifications) {
                                            const justifications = Object.keys(greatGrandchildData.justifications)
                                                .map(id => ({ id, path: `${greatGrandchildPath}/justifications/${id}`, ...greatGrandchildData.justifications[id] }))
                                                .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
                                            
                                            for (const justData of justifications) {
                                                const hasSub = justData.subJustifications && Object.keys(justData.subJustifications).length > 0;
                                                const iconHtml = hasSub ? `<span class="tree-toggle-icon" onclick="toggleSubJust(event, '${justData.path}')">▶</span>` : '';
                                                const dblClick = hasSub ? `ondblclick="toggleSubJust(event, '${justData.path}')" style="cursor:pointer;"` : '';

                                                // Render Giải trình cha (LUÔN HIỂN THỊ, không bị ảnh hưởng bởi Cấp 5)
                                                html += `<tr class="task-justification task-justification-parent" data-main-parent="${mainParentId}" data-path="${justData.path}">
                                                    <td><input type="checkbox" class="justification-checkbox ${hasSub ? 'parent-checkbox' : ''}" data-path="${justData.path}" data-parent-path="${greatGrandchildPath}" onchange="${hasSub ? 'toggleChildrenCheckboxes(this)' : 'toggleSelection(this)'}"></td>
                                                    <td class="col-tt">${convertTTForDisplay(justData.tt)}</td>
                                                    <td class="col-noidung" ${dblClick}>${iconHtml}${justData.noiDung}</td>
                                                    <td class="col-tagname"></td><td class="col-dv-thuchien"></td><td class="text-right col-kh-nam-truoc"></td><td class="text-right col-th-nam-truoc"></td>
                                                    <td class="col-donvi editable-cell" data-field="donVi">${justData.donVi || ''}</td>
                                                    <td class="col-soluong">${justData.soLuong || ''}</td><td class="col-tansuat-th"></td>
                                                    <td class="text-right col-chiphi">${formatNumber(justData.chiPhi || 0)}</td>
                                                    <td class="text-right col-chiphi-thuchien"></td><td class="text-right col-kehoach-conlai"></td><td class="col-nam-phanbo"></td><td class="col-chiphi-phanbo"></td><td class="col-capdo"></td><td class="col-cp-cap1"></td><td class="col-tg-batdau"></td><td class="col-tg-hoanthanh"></td>
                                                    <td class="col-ghichu editable-cell" data-field="ghiChu">${justData.ghiChu || ''}</td><td class="col-hoso"></td>
                                                    <td class="col-action"><div class="dropdown"><button onclick="toggleDropdown(event)" class="btn-secondary btn-action dropbtn">Thêm/sửa</button><div class="dropdown-content"><a href="javascript:void(0)" onclick="openAddModal('${justData.path}', 'subJustification')">Thêm GT con</a><a href="javascript:void(0)" onclick="handleEditClick('${justData.path}', 'justification')">Sửa giải trình</a></div></div></td>
                                                </tr>`;

                                                // Render Giải trình con (Mặc định ẩn)
                                                if (hasSub) {
                                                    const subClass = (!isPlanningMode) ? 'subjust-collapsed' : '';
                                                    const subJustifications = Object.keys(justData.subJustifications).map(subId => ({ id: subId, path: `${justData.path}/subJustifications/${subId}`, ...justData.subJustifications[subId] })).sort((a, b) => String(a.tt || '').localeCompare(String(b.tt || ''), undefined, { numeric: true, sensitivity: 'base' }));
                                                    
                                                    for (const subJust of subJustifications) {
                                                        html += `<tr class="task-justification task-justification-child ${subClass}" data-subjust-parent="${justData.path}" data-main-parent="${mainParentId}" data-path="${subJust.path}">
                                                            <td><input type="checkbox" class="justification-checkbox" data-path="${subJust.path}" data-parent-path="${justData.path}" onchange="toggleSelection(this)"></td>
                                                            <td class="col-tt">${convertTTForDisplay(subJust.tt)}</td>
                                                            <td class="col-noidung" style="padding-left: 40px; font-style: italic;">${subJust.noiDung}</td>
                                                            <td class="col-tagname"></td><td class="col-dv-thuchien"></td><td class="text-right col-kh-nam-truoc"></td><td class="text-right col-th-nam-truoc"></td>
                                                            <td class="col-donvi editable-cell" data-field="donVi">${subJust.donVi || ''}</td>
                                                            <td class="col-soluong">${subJust.soLuong || ''}</td><td class="col-tansuat-th"></td>
                                                            <td class="text-right col-chiphi">${formatNumber(subJust.chiPhi || 0)}</td>
                                                            <td class="text-right col-chiphi-thuchien"></td><td class="text-right col-kehoach-conlai"></td><td class="col-nam-phanbo"></td><td class="col-chiphi-phanbo"></td><td class="col-capdo"></td><td class="col-cp-cap1"></td><td class="col-tg-batdau"></td><td class="col-tg-hoanthanh"></td>
                                                            <td class="col-ghichu editable-cell" data-field="ghiChu">${subJust.ghiChu || ''}</td><td class="col-hoso"></td>
                                                            <td class="col-action"><button class="btn-secondary btn-action btn-edit-leaf" onclick="handleEditClick('${subJust.path}', 'subJustification')">Sửa</button></td>
                                                        </tr>`;
                                                    }
                                                }
                                            }
                                        }

                                        if (isParentLeaf && greatGrandchildData.greatGreatGrandchildren) {
                                            const greatGreatGrandchildren = Object.keys(greatGrandchildData.greatGreatGrandchildren).map(id => ({ id, ...greatGrandchildData.greatGreatGrandchildren[id] })).sort(numericSort);
                                            for (const gggcData of greatGreatGrandchildren) {
                                                const gggcPath = `${greatGrandchildPath}/greatGreatGrandchildren/${gggcData.id}`;
                                                docDataMap.set(gggcPath, gggcData);
                                                
                                                // --- XỬ LÝ CẤP 5 (GreatGreatGrandchild) ---
                                                // 1. Thêm data-l5-parent để biết nó thuộc về ai
                                                // 2. Nếu không phải Planning Mode thì thêm class 'l5-collapsed' để ẩn
                                                const hiddenClass = (!isPlanningMode) ? 'l5-collapsed' : '';
                                                const gggcAttr = `data-l5-parent="${greatGrandchildPath}"`;
                                                
                                                html += createRowHtml(`task-great-great-grandchild ${hiddenClass}`, gggcPath, gggcData, gggcAttr);

                                                
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            tableBody.innerHTML = html || `<tr><td colspan="17" style="text-align: center;">Không có dữ liệu cho năm ${currentYear}.</td></tr>`;

            // ... (Phần Summary giữ nguyên như code cũ của bạn) ...
            let summaryTotalLeafNodes = 0; let summaryTotalExecutedLeafNodes = 0;
            let summaryTotalLeafNodesCap1 = 0; let summaryTotalExecutedLeafNodesCap1 = 0;
            for (const parentId in summaryData) {
                const parentSummary = summaryData[parentId];
                summaryTotalLeafNodes += parentSummary.totalLeafNodes || 0;
                summaryTotalExecutedLeafNodes += parentSummary.totalExecutedLeafNodes || 0;
                summaryTotalLeafNodesCap1 += parentSummary.totalLeafNodesCap1 || 0;
                summaryTotalExecutedLeafNodesCap1 += parentSummary.totalExecutedLeafNodesCap1 || 0;
            }
            const leafNodePercentage = summaryTotalLeafNodes > 0 ? Math.round((summaryTotalExecutedLeafNodes / summaryTotalLeafNodes) * 100) : 0;
            const costPercentage = totalPlannedCost > 0 ? Math.round((totalExecutedCost / totalPlannedCost) * 100) : 0;
            const cap1Percentage = summaryTotalLeafNodesCap1 > 0 ? Math.round((summaryTotalExecutedLeafNodesCap1 / summaryTotalLeafNodesCap1) * 100) : 0;
            
            const summaryHtml = `
                <button class="btn-info" style="position: absolute; top: 10px; right: 10px; padding: 5px 10px; font-size: 14px;" onclick="openSummaryDetailModal()">Xem chi tiết các đơn vị</button>
                <div class="summary-column">
                    <p><strong>Tổng số đầu việc chi tiết trong kế hoạch:</strong> ${summaryTotalLeafNodes}</p>
                    <p><strong>Tổng số đầu việc cấp độ 1 cần thực hiện:</strong> ${summaryTotalLeafNodesCap1}</p>
                    <p><strong>Tổng chi phí theo kế hoạch:</strong> ${formatNumber(totalPlannedCost)}</p>
                </div>
                <div class="summary-column">
                    <p><strong>Số đầu việc chi tiết đã thực hiện:</strong> ${summaryTotalExecutedLeafNodes} <span class="percentage">(${leafNodePercentage}%)</span></p>
                    <p><strong>Số đầu việc cấp độ 1 đã thực hiện:</strong> ${summaryTotalExecutedLeafNodesCap1} <span class="percentage">(${cap1Percentage}%)</span></p>
                    <p><strong>Tổng chi phí đã thực hiện:</strong> ${formatNumber(totalExecutedCost)} <span class="percentage">(${costPercentage}%)</span></p>
                </div>`;
            if(document.getElementById('summarySection')) document.getElementById('summarySection').innerHTML = summaryHtml;
            selectedTasks.clear(); selectedJustifications.clear();
            if (typeof updateButtonStates === 'function') updateButtonStates();
            if (statusDiv) statusDiv.innerText = '';
            setTimeout(() => { window.scrollTo(0, scrollPosition); }, 0);

        } catch (error) { 
            console.error("Lỗi tải dữ liệu: ", error); 
            tableBody.innerHTML = `<tr><td colspan="17" style="text-align: center; color: red;">Lỗi tải dữ liệu: ${error.message}</td></tr>`; 
            setTimeout(() => { window.scrollTo(0, scrollPosition); }, 0);
        }
    };
    
	// === 1. BIẾN VÀ HÀM HỖ TRỢ KIỂM TRA TAG HỢP LỆ ===
    window.validTagsCache = null; // Biến toàn cục lưu danh sách tag

    // Hàm tải danh sách Tag từ DB (chỉ tải 1 lần rồi dùng cache)
    window.ensureValidTagsLoaded = async function() {
        if (window.validTagsCache !== null) return; // Đã có cache thì thôi

        try {
            const snapshot = await get(ref(db, 'Quanlythietbi'));
            const tagsSet = new Set(); // Dùng Set để tìm kiếm cực nhanh
            
            if (snapshot.exists()) {
                const data = snapshot.val();
                // Duyệt cây: Gốc -> La Mã -> Số -> Item
                Object.values(data).forEach(groupLaMa => {
                    if (typeof groupLaMa !== 'object') return;
                    Object.values(groupLaMa).forEach(item => {
                        if (typeof item !== 'object') return;
                        
                        // Tìm key tagName bất kể hoa thường
                        const keys = Object.keys(item);
                        const tagKey = keys.find(k => k.toLowerCase() === 'tagname');
                        
                        if (tagKey && item[tagKey]) {
                            // Lưu vào danh sách chuẩn (chữ thường để so sánh)
                            tagsSet.add(String(item[tagKey]).trim().toLowerCase());
                        }
                    });
                });
            }
            window.validTagsCache = tagsSet;
            console.log("Đã tải danh sách Tag hợp lệ:", window.validTagsCache.size, "tags");
        } catch (error) {
            console.error("Lỗi tải danh sách Tag:", error);
            window.validTagsCache = new Set(); // Fallback rỗng để không lỗi code
        }
    };

    // Hàm kiểm tra 1 giá trị có nằm trong danh sách không
    window.isValidTagName = async function(value) {
        if (!value || value.trim() === '') return true; // Cho phép để trống
        await ensureValidTagsLoaded();
        return window.validTagsCache.has(value.trim().toLowerCase());
    };

// === HÀM HỖ TRỢ: Tải và Kiểm tra Tag Name ===
window.tagDataCache = { validSet: null };

// 1. Tải dữ liệu và tạo Datalist (Chỉ chạy 1 lần)
window.ensureTagDataLoaded = async function() {
    if (window.tagDataCache.validSet) return; // Đã tải rồi thì thôi

    try {
        const snapshot = await get(ref(db, 'Quanlythietbi'));
        if (!snapshot.exists()) return;

        const validSet = new Set();
        let optionsHTML = '';
        const data = snapshot.val();

        // Duyệt cây dữ liệu để lấy danh sách
        Object.values(data).forEach(group => {
            if (typeof group === 'object') {
                Object.values(group).forEach(item => {
                    if (typeof item === 'object') {
                        // Tìm key TagName không phân biệt hoa thường
                        const keys = Object.keys(item);
                        const tagKey = keys.find(k => k.toLowerCase() === 'tagname');
                        const nameKey = keys.find(k => k.toLowerCase() === 'tenthietbi');

                        if (tagKey && item[tagKey]) {
                            const tag = String(item[tagKey]).trim();
                            const name = nameKey ? String(item[nameKey]).trim() : '';
                            
                            validSet.add(tag.toLowerCase()); // Lưu để kiểm tra
                            optionsHTML += `<option value="${tag}">${name}</option>`; // Lưu để hiển thị
                        }
                    }
                });
            }
        });

        window.tagDataCache.validSet = validSet;

        // Tạo thẻ <datalist> để gợi ý
        let datalist = document.getElementById('deviceTagsList');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'deviceTagsList';
            document.body.appendChild(datalist);
        }
        datalist.innerHTML = optionsHTML;

    } catch (e) { console.error("Lỗi tải Tag:", e); }
};

// 2. Hàm kiểm tra giá trị nhập vào có đúng không
window.checkTagIsValid = async function(value) {
    if (!value || value.trim() === '') return true; // Cho phép để trống
    await window.ensureTagDataLoaded();
    return window.tagDataCache.validSet.has(value.trim().toLowerCase());
};

// =========================================================================
    // HÀM QUẢN LÝ TÊN CƠ SỞ (HIỂN THỊ H2 TỪ DB)
    // =========================================================================
    async function manageFacilityName() {
        const titleElement = document.getElementById('mainPageTitle');
        if (!titleElement) return;

        try {
            // 1. Đọc dữ liệu từ DB
            const snapshot = await get(ref(db, 'settings/tenCoSo'));
            const tenCoSo = snapshot.val();

            // 2. Xử lý hiển thị
            if (tenCoSo && String(tenCoSo).trim() !== '') {
                // Trường hợp CÓ dữ liệu: Hiển thị lên thẻ H2
                titleElement.innerText = tenCoSo;
                // document.title = tenCoSo; // (Tùy chọn) Cập nhật cả tiêu đề tab trình duyệt
            } else {
                // Trường hợp KHÔNG có dữ liệu hoặc Rỗng
                titleElement.innerText = ''; // Để trống theo yêu cầu

                // 3. Xử lý nhập liệu (Chỉ khi đã đăng nhập)
                if (isAuthenticated) {
                    // Dùng setTimeout để tránh chặn luồng render giao diện
                    setTimeout(async () => {
                        const newName = prompt("Hệ thống chưa có Tên Cơ Sở (tiêu đề trang). Vui lòng nhập tên hiển thị:");
                        if (newName && newName.trim() !== "") {
                            try {
                                // Lưu vào CSDL
                                await update(ref(db, 'settings'), { tenCoSo: newName.trim() });
                                // Cập nhật giao diện ngay lập tức
                                titleElement.innerText = newName.trim();
                                statusDiv.className = 'success';
                                statusDiv.innerText = 'Đã cập nhật tên cơ sở thành công!';
                            } catch (err) {
                                console.error("Lỗi khi lưu tên cơ sở:", err);
                                alert("Không thể lưu tên cơ sở. Bạn có thể không có quyền ghi.");
                            }
                        }
                    }, 500);
                }
            }
        } catch (error) {
            console.warn("Không thể đọc cấu hình tên cơ sở (có thể do chưa đăng nhập hoặc lỗi mạng):", error);
            // Nếu lỗi đọc (ví dụ rules chặn khách), ta giữ nguyên mặc định hoặc xóa trống tùy ý.
            // Ở đây ta xóa trống theo yêu cầu "Nếu không có thì để trống".
            titleElement.innerText = ''; 
        }
    }
	
	// =========================================================================
    // HÀM TOGGLE HIỂN THỊ TASK CẤP 5 (EXPAND/COLLAPSE)
    // =========================================================================
    window.toggleLevel5 = function(event, parentPath) {
        // Ngăn chặn việc chọn văn bản khi click nhanh
        if(event) {
            event.preventDefault();
            event.stopPropagation();
        }

        // 1. Tìm dòng cha (Cấp 4) để xoay icon
        const parentRow = document.querySelector(`tr[data-path="${parentPath}"]`);
        if (!parentRow) return;

        const icon = parentRow.querySelector('.tree-toggle-icon');
        const isExpanding = icon && !icon.classList.contains('expanded');

        // 2. Xoay icon (nếu có)
        if (icon) {
            icon.classList.toggle('expanded');
        }

        // 3. Tìm tất cả các dòng con (Cấp 5) dựa vào thuộc tính data-parent-path
        // Lưu ý: Cần thêm data-parent-path vào HTML tạo dòng cấp 5 ở bước sau
        const childRows = document.querySelectorAll(`tr[data-l5-parent="${parentPath}"]`);

        childRows.forEach(row => {
            if (isExpanding) {
                row.classList.remove('l5-collapsed');
            } else {
                row.classList.add('l5-collapsed');
            }
        });
    };
	
	// =========================================================================
    // HÀM TOGGLE HIỂN THỊ GIẢI TRÌNH CON (EXPAND/COLLAPSE)
    // =========================================================================
    window.toggleSubJust = function(event, parentPath) {
        if(event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const parentRow = document.querySelector(`tr[data-path="${parentPath}"]`);
        if (!parentRow) return;

        const icon = parentRow.querySelector('.tree-toggle-icon');
        const isExpanding = icon && !icon.classList.contains('expanded');

        if (icon) {
            icon.classList.toggle('expanded');
        }

        const childRows = document.querySelectorAll(`tr[data-subjust-parent="${parentPath}"]`);
        childRows.forEach(row => {
            if (isExpanding) {
                row.classList.remove('subjust-collapsed');
            } else {
                row.classList.add('subjust-collapsed');
            }
        });
    };
// =========================================================================
    // HỆ THỐNG ENGINE: CHUYỂN DỊCH VỊ TRÍ TRỰC QUAN BẰNG BÀN PHÍM (V4)
    // =========================================================================
    let moveState = { active: false, sourcePath: null, sourceLevel: null, movingRows: [], originalNextSibling: null };

    // SỬA LỖI 1: Nhận diện chính xác L5 và Giải trình để không chặn vòng lặp tìm cha
    const getLevelFromRow = (row) => {
        if (row.classList.contains('task-parent')) return 1;
        if (row.classList.contains('task-child')) return 2;
        if (row.classList.contains('task-grandchild')) return 3;
        if (row.classList.contains('task-great-grandchild')) return 4;
        if (row.classList.contains('task-great-great-grandchild')) return 5;
        if (row.classList.contains('task-justification') || row.classList.contains('justification-row')) return 5;
        if (row.classList.contains('task-justification-child')) return 6;
        return 99; // Các dòng lạ sẽ bị ép xuống đáy để vòng lặp quét xuyên qua chúng
    };

    window.startMoveSelected = async function() {
        if (!isAuthenticated) return showAuthError();

        const checkedBoxes = Array.from(document.querySelectorAll('#taskListBody input[type="checkbox"]:checked'));
        if (checkedBoxes.length === 0) return;

        const checkedPaths = checkedBoxes.map(cb => cb.dataset.path);
        const rootPaths = checkedPaths.filter(path => !checkedPaths.some(otherPath => path !== otherPath && path.startsWith(otherPath + '/')));

        if (rootPaths.length > 1) {
            alert("Bạn đang chọn nhiều mục rời rạc. Vui lòng chỉ chọn ĐÚNG 1 nhánh để chuyển dịch."); return;
        }

        let sourcePath = rootPaths[0];
        let sourceRow = document.querySelector(`tr[data-path="${sourcePath}"]`);
        let level = getLevelFromRow(sourceRow);

        const directChildrenRows = Array.from(document.querySelectorAll(`#taskListBody tr`)).filter(r => r.dataset.path?.startsWith(sourcePath + '/') && getLevelFromRow(r) === level + 1);
        
        if (directChildrenRows.length === 1) {
            const parentName = sourceRow.querySelector('.col-noidung').innerText.trim();
            const childName = directChildrenRows[0].querySelector('.col-noidung').innerText.trim();
            const choice = prompt(`Hệ thống phát hiện nhánh này chỉ có 1 công việc con.\nBạn muốn di chuyển cấp nào?\n\nNhập '1' để di chuyển CHA: [${parentName}]\nNhập '2' để di chuyển CON: [${childName}]`);
            if (choice === '2') {
                sourcePath = directChildrenRows[0].dataset.path;
                sourceRow = directChildrenRows[0];
                level = level + 1;
            } else if (choice !== '1') return;
        }

        if (level < 2 || level > 4) { alert("Chỉ hỗ trợ chuyển dịch các mục từ Cấp 2 đến Cấp 4."); return; }

        const movingRows = Array.from(document.querySelectorAll(`#taskListBody tr`)).filter(r => r.dataset.path === sourcePath || r.dataset.path?.startsWith(sourcePath + '/'));

        moveState = {
            active: true, sourcePath: sourcePath, sourceLevel: level, movingRows: movingRows,
            originalNextSibling: movingRows[movingRows.length - 1].nextElementSibling
        };

        document.body.classList.add('is-moving-mode');
        movingRows.forEach(r => r.classList.add('moving-source'));
        
        sourceRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.addEventListener('keydown', handleMoveKeydown);
    };

    function handleMoveKeydown(e) {
        if (!moveState.active) return;
        if (e.key === 'Escape') { e.preventDefault(); cancelMove(false); } 
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveDOMBlock(-1); } 
        else if (e.key === 'ArrowDown') { e.preventDefault(); moveDOMBlock(1); } 
        else if (e.key === 'Enter') {
            e.preventDefault();
            const validation = checkDropValid();
            if (validation.isValid) {
                executeMove(validation);
            } else {
                alert(`Vị trí hiện tại KHÔNG HỢP LỆ (Sai cấp độ).\n\nVui lòng dùng phím Lên/Xuống di chuyển khối công việc này vào đúng vị trí nằm dưới quyền của một mục Cấp ${moveState.sourceLevel - 1}.`);
            }
        }
    }

    function moveDOMBlock(direction) {
        const tbody = document.getElementById('taskListBody');
        const firstRow = moveState.movingRows[0];
        const lastRow = moveState.movingRows[moveState.movingRows.length - 1];

        // Hàm phụ trợ: Tìm dòng HIỂN THỊ gần nhất phía trên
        const getPrevVisible = (row) => {
            let prev = row.previousElementSibling;
            while (prev) {
                // Sử dụng offsetHeight > 0 để xác định dòng có đang hiển thị hay không
                if (prev.offsetHeight > 0) return prev;
                prev = prev.previousElementSibling;
            }
            return null;
        };

        // Hàm phụ trợ: Tìm dòng HIỂN THỊ gần nhất phía dưới
        const getNextVisible = (row) => {
            let next = row.nextElementSibling;
            while (next) {
                if (next.offsetHeight > 0) return next;
                next = next.nextElementSibling;
            }
            return null;
        };

        if (direction === -1) {
            // Di chuyển LÊN: Tìm dòng HIỂN THỊ ngay bên trên và chèn toàn bộ khối lên trước nó
            // Động tác này sẽ tự động đưa khối của bạn lên trên cả những dòng con bị ẩn của dòng đó
            const targetRow = getPrevVisible(firstRow);
            if (targetRow) {
                moveState.movingRows.forEach(row => tbody.insertBefore(row, targetRow));
            }
        } else if (direction === 1) {
            // Di chuyển XUỐNG: Cần nhảy qua toàn bộ khối của dòng HIỂN THỊ tiếp theo
            const nextVis = getNextVisible(lastRow);
            if (nextVis) {
                // Tìm dòng hiển thị tiếp theo nữa làm cột mốc chèn
                const targetForInsert = getNextVisible(nextVis);
                if (targetForInsert) {
                    moveState.movingRows.forEach(row => tbody.insertBefore(row, targetForInsert));
                } else {
                    // Nếu không còn dòng hiển thị nào bên dưới, đẩy xuống cuối bảng
                    moveState.movingRows.forEach(row => tbody.appendChild(row));
                }
            }
        }
        
        // Tối ưu cuộn: Giữ dòng đầu tiên trong khung nhìn với khoảng cách gần nhất
        // (Tránh dùng 'center' gây giật khung hình liên tục)
        if (firstRow) {
            firstRow.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        }
    }

    function checkDropValid() {
        let prev = moveState.movingRows[0].previousElementSibling;
        let potentialParentRow = null;
        let prevSiblingRow = null;

        while (prev) {
            const lvl = getLevelFromRow(prev);
            if (lvl === moveState.sourceLevel - 1) {
                potentialParentRow = prev; break;
            } else if (lvl === moveState.sourceLevel && !prevSiblingRow) {
                prevSiblingRow = prev;
            } else if (lvl > 0 && lvl < moveState.sourceLevel - 1) {
                // Thoát nếu chạm trúng một parent của level cao hơn mà không tìm thấy cha hợp lệ
                break;
            }
            prev = prev.previousElementSibling;
        }

        if (potentialParentRow) {
            return {
                isValid: true,
                parentPath: potentialParentRow.dataset.path,
                parentName: potentialParentRow.querySelector('.col-noidung').innerText.trim(),
                siblingTT: prevSiblingRow ? prevSiblingRow.querySelector('.col-tt').innerText.trim() : null
            };
        }
        return { isValid: false };
    }

    function cancelMove(isSuccess) {
        moveState.active = false;
        document.body.classList.remove('is-moving-mode');
        moveState.movingRows.forEach(r => r.classList.remove('moving-source'));

        if (!isSuccess) {
            const tbody = document.getElementById('taskListBody');
            moveState.movingRows.forEach(row => {
                if (moveState.originalNextSibling) tbody.insertBefore(row, moveState.originalNextSibling);
                else tbody.appendChild(row);
            });
        }
        document.removeEventListener('keydown', handleMoveKeydown);
    }

    async function executeMove(validation) {
        const { get, ref, update } = await import("https://www.gstatic.com/firebasejs/10.4.0/firebase-database.js");
        const parentPath = validation.parentPath;
        let subCol = moveState.sourceLevel === 2 ? 'children' : (moveState.sourceLevel === 3 ? 'grandchildren' : 'greatGrandchildren');

        const snap = await get(ref(db, `${parentPath}/${subCol}`));
        const existingData = snap.exists() ? snap.val() : {};
        const usedIds = [];
        
        const extractNum = (tt) => {
            if (moveState.sourceLevel === 2) return romanToNumber(tt);
            if (moveState.sourceLevel === 3) return parseInt(tt, 10);
            return parseInt(String(tt).split(/[.,_]/).pop(), 10);
        };

        Object.values(existingData).forEach(child => { if (child.tt) usedIds.push(extractNum(child.tt)); });
        usedIds.sort((a, b) => a - b);

        let targetLocalId = 1;
        if (validation.siblingTT) {
            const expectedNum = extractNum(validation.siblingTT) + 1;
            targetLocalId = usedIds.includes(expectedNum) ? (usedIds.length > 0 ? usedIds[usedIds.length - 1] + 1 : 1) : expectedNum;
        } else {
            targetLocalId = usedIds.includes(1) ? (usedIds.length > 0 ? usedIds[usedIds.length - 1] + 1 : 1) : 1;
        }

        let newTT = '';
        const parentTT = docDataMap.get(parentPath)?.tt || '';
        if (moveState.sourceLevel === 2) newTT = numberToRoman(targetLocalId);
        else if (moveState.sourceLevel === 3) newTT = String(targetLocalId);
        else {
            const cleanParent = String(parentTT).replace(/[._]/g, ','); 
            newTT = `${cleanParent},${targetLocalId}`;
        }

        const newPath = `${parentPath}/${subCol}/${typeof convertTTForStorage === 'function' ? convertTTForStorage(newTT) : newTT.replace(/[.,]/g, '_')}`;

        if (!confirm(`XÁC NHẬN CHUYỂN DỊCH:\n\n- Sẽ chuyển nhánh công việc này vào làm con của: [${validation.parentName}]\n- Mã TT mới: ${convertTTForDisplay(newTT)}\n\nBạn có chắc chắn lưu?`)) {
            return; // Khối công việc vẫn nằm tại chỗ để bạn chọn vị trí khác
        }

        try {
            if (typeof statusDiv !== 'undefined') { statusDiv.className = 'info'; statusDiv.innerText = "Đang chuyển dịch dữ liệu..."; }
            
            const sourceSnap = await get(ref(db, moveState.sourcePath));
            let sourceBranch = sourceSnap.val();

            // SỬA LỖI 2: Thuật toán đệ quy đổi ID con bóc tách phần ngọn để nối vào gốc, 100% miễn nhiễm với Giải trình
            const renameBranch = (node, nTT, nodeLvl) => {
                node.tt = nTT;
                
                if (nodeLvl === 3 && node.greatGrandchildren) {
                    const newL4Map = {};
                    for (let key in node.greatGrandchildren) {
                        let child = node.greatGrandchildren[key];
                        // Bóc số ID con cuối cùng (ví dụ: 1_2_1 -> lấy 1)
                        const localIdStr = String(child.tt || key).split(/[.,_]/).pop();
                        
                        // Nối ID con vào TT mới của cha
                        const cleanParent = String(nTT).replace(/[._]/g, ',');
                        const childNewTT = `${cleanParent},${localIdStr}`;
                        const childNewKey = typeof convertTTForStorage === 'function' ? convertTTForStorage(childNewTT) : childNewTT.replace(/,/g, '_');
                        
                        child = renameBranch(child, childNewTT, 4);
                        newL4Map[childNewKey] = child;
                    }
                    node.greatGrandchildren = newL4Map;
                }
                
                if (nodeLvl === 4 && node.greatGreatGrandchildren) {
                    const newL5Map = {};
                    for (let key in node.greatGreatGrandchildren) {
                        let child = node.greatGreatGrandchildren[key];
                        const localIdStr = String(child.tt || key).split(/[.,_]/).pop();
                        
                        const cleanParent = String(nTT).replace(/[._]/g, ',');
                        const childNewTT = `${cleanParent},${localIdStr}`;
                        const childNewKey = typeof convertTTForStorage === 'function' ? convertTTForStorage(childNewTT) : childNewTT.replace(/,/g, '_');
                        
                        child = renameBranch(child, childNewTT, 5);
                        newL5Map[childNewKey] = child;
                    }
                    node.greatGreatGrandchildren = newL5Map;
                }
                
                return node; // Các phần khác (bao gồm Justifications) được trả về nguyên trạng, không bị đổi ID
            };

            sourceBranch = renameBranch(sourceBranch, newTT, moveState.sourceLevel);

            const updates = {};
            updates[moveState.sourcePath] = null;
            updates[newPath] = sourceBranch;
            if (moveState.sourceLevel === 4) updates[`${parentPath}/hasChildren`] = true;

            await update(ref(db), updates);
            
            alert("Chuyển dịch thành công!");
            cancelMove(true); 
            
            // SỬA LỖI 3: Gọi hàm tính toán lại nội bộ và render lại bảng mà không cần F5 tải lại trang web
            if (typeof recalculateAllCostsAndReload === 'function') {
                await recalculateAllCostsAndReload(false);
            } else if (typeof fetchData === 'function') {
                await fetchData();
            }

        } catch (error) {
            console.error(error); 
            alert("Lỗi: " + error.message); 
            cancelMove(false);
        }
    }