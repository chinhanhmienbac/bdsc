/* tbscript.js */

// --- LẤY LẠI CÁC THAM CHIẾU FIREBASE TỪ GLOBAL SCOPE ---
const db = window.db;
const auth = window.auth;
const ref = window.FB_ref;
const set = window.FB_set;
const get = window.FB_get;
const update = window.FB_update;
const remove = window.FB_remove;
const signInWithEmailAndPassword = window.FB_signInWithEmailAndPassword;
const setPersistence = window.FB_setPersistence;
const browserSessionPersistence = window.FB_browserSessionPersistence;
const signOut = window.FB_signOut;


    const START_YEAR = 2023; // Hãy sửa số này thành năm cũ nhất bạn có dữ liệu
const currentYear = new Date().getFullYear(); // Lấy năm hiện tại (ví dụ: 2025)
const TARGET_YEARS = [];

// Vòng lặp tạo danh sách từ năm bắt đầu đến năm sau (để dự phòng cho tương lai gần)
for (let y = START_YEAR; y <= currentYear + 1; y++) {
    TARGET_YEARS.push(y);
}

    // Helpers (Declared Top)
    window.showLoading = function(msg) { document.getElementById('loadingText').innerText = msg; document.getElementById('loadingMsg').style.display = "flex"; };
    window.hideLoading = function() { document.getElementById('loadingMsg').style.display = "none"; };
    window.romanToInt = function(s) { if(!s) return 0; const r = {'I':1,'V':5,'X':10,'L':50}; let n=0; for(let i=0;i<s.length;i++){ if(i+1<s.length && r[s[i]]<r[s[i+1]]) n-=r[s[i]]; else n+=r[s[i]]; } return n; };
    // Helper: Chuyển số nguyên sang số La Mã
    window.intToRoman = function(num) {
        if (typeof num !== 'number') return '';
        const lookup = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
        let roman = '';
        for (let i in lookup) {
            while (num >= lookup[i]) {
                roman += i;
                num -= lookup[i];
            }
        }
        return roman;
    };
	
	window.formatNum = function(n) { return n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "-"; };
    window.markDeleted = function(el) { el.closest('.manage-item-row').classList.add('d-none', 'marked-delete'); };

    // DOM Elements
    const elements = {
        tableBody: document.getElementById('tableBody'),
        facilityName: document.getElementById('facilityName'),
        editToggle: document.getElementById('editModeToggle'),
        
        viewBtns: document.getElementById('viewModeBtns'),
        editBtns: document.getElementById('editModeBtns'),
        driveInput: document.getElementById('driveUploadInput'),
        loginModal: new bootstrap.Modal(document.getElementById('loginModal')),
        manageModal: new bootstrap.Modal(document.getElementById('manageModal')),
        historyModal: new bootstrap.Modal(document.getElementById('historyModal')),
        deviceModal: new bootstrap.Modal(document.getElementById('deviceModal')),
		addLinkModal: new bootstrap.Modal(document.getElementById('addLinkModal'))
    };

    let localDataCache = null, localViewMode = false;
    let currentUploadTarget = null, currentManageTarget = null, currentHistoryData = null, currentCategoryForDevice = null;

    // --- 1. SESSION SECURITY (Logout on Close) ---
    function checkSessionValidity() {
        const sessionFlag = sessionStorage.getItem('app_active_session');
        if (!sessionFlag) {
            // New tab or browser restart -> Force Logout
            signOut(auth).then(() => {
                sessionStorage.setItem('app_active_session', 'true');
            }).catch(() => {
                sessionStorage.setItem('app_active_session', 'true');
            });
        }
    }

    window.onload = function() {
        checkSessionValidity(); // Check session on load
        loadAllData();
        
		setEditMode(false);
    };

   
    // --- FIREBASE LOGIN ---
    elements.editToggle.addEventListener('click', (e) => {
        if (e.target.checked) {
            if (auth.currentUser) {
                setEditMode(true);
            } else {
                e.preventDefault();
                elements.loginModal.show();
            }
        } else {
            setEditMode(false);
        }
    });

    window.closeLoginModal = function() { elements.loginModal.hide(); elements.editToggle.checked = false; }

    window.handleLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    window.showLoading("Đang đăng nhập...");
    try {
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        
        elements.loginModal.hide();
        elements.editToggle.checked = true;
        
        // 1. Chuyển giao diện sang chế độ Sửa
        setEditMode(true); 
        
        // 2. Xóa mật khẩu ở form
        document.getElementById('loginPassword').value = "";

        // 3. [QUAN TRỌNG] Gọi hàm tải lại toàn bộ dữ liệu từ Server
        // Hàm này sẽ tự động hiện loading spinner nên không lo bị xung đột
        loadAllData(); 

    } catch (error) {
        alert("Đăng nhập thất bại: " + error.message);
        elements.editToggle.checked = false;
        window.hideLoading(); // Chỉ ẩn loading nếu lỗi, còn thành công thì loadAllData sẽ tự xử lý
    } 
    // Lưu ý: Đã bỏ khối finally { window.hideLoading() } ở đây để tránh tắt spinner của loadAllData quá sớm
};

  function setEditMode(isEdit) {
        localViewMode = isEdit;
        const table = document.getElementById('mainTable');
        
        // Các nút cần điều khiển
        const btnImport = document.getElementById('btnImportExcel');
        const btnBackup = document.getElementById('btnBackup');
        const btnRestore = document.getElementById('btnRestore');
        const user = auth.currentUser;
        const isAdmin = (user && user.email === 'admin@pvgaslpg.com.vn');

        if(isEdit) {
            // --- CHẾ ĐỘ CHỈNH SỬA ---
            table.classList.add('edit-mode-on');
            elements.viewBtns.style.setProperty('display', 'none', 'important');
            elements.editBtns.style.setProperty('display', 'flex', 'important');
            
            // 1. Ẩn nút Backup
            if(btnBackup) btnBackup.style.display = 'none';

            // 2. Xử lý quyền Admin cho nút Restore và nút Import Excel
            if (isAdmin) {
                if(btnImport) btnImport.style.display = 'block';
                if(btnRestore) btnRestore.style.display = 'block'; // Admin mới thấy Restore
            } else {
                if(btnImport) btnImport.style.display = 'none';
                if(btnRestore) btnRestore.style.display = 'none';
            }

            

        } else {
            // --- CHẾ ĐỘ XEM (Mặc định) ---
            table.classList.remove('edit-mode-on');
            elements.viewBtns.style.setProperty('display', 'flex', 'important');
            elements.editBtns.style.setProperty('display', 'none', 'important');

            // 1. Hiện nút Backup
            if(btnBackup) btnBackup.style.display = 'block';
            
            // 2. Ẩn nút Restore
            if(btnRestore) btnRestore.style.display = 'none';

            // Ẩn các nút Admin/Drive
            
            if(btnImport) btnImport.style.display = 'none';
        }
        renderTable(localDataCache);
    }

    // --- DATA RENDERING ---
    function loadAllData() {
        window.showLoading("Đang tải dữ liệu...");
        Promise.all([
            get(ref(db, 'settings/tenCoSo')),
            get(ref(db, 'Quanlythietbi'))
        ]).then((results) => {
            const name = results[0].val();
            localDataCache = results[1].val();
            elements.facilityName.textContent = name ? name : "..........................";
            renderTable(localDataCache);
        }).catch((error) => { console.error(error); alert("Lỗi tải dữ liệu."); })
          .finally(() => window.hideLoading());
    }

    function renderTable(data) {
        elements.tableBody.innerHTML = "";
        if (!data) { elements.tableBody.innerHTML = "<tr><td colspan='12' class='text-center'>Chưa có dữ liệu</td></tr>"; return; }

        const categories = Object.keys(data).sort((a, b) => window.romanToInt(a) - window.romanToInt(b));

        categories.forEach(catKey => {
            const catData = data[catKey];
            const rowCat = document.createElement('tr');
            rowCat.className = "category-row";
            
            if (localViewMode) {
                rowCat.innerHTML = `<td class="col-stt">${catKey}</td>
                                    <td colspan="9">${catData.TenPhanLoai || ""}</td>
                                    <td colspan="2" class="text-center align-middle">
                                        <button class="btn btn-warning btn-sm fw-bold" style="font-size:11px; padding: 2px 5px;" onclick="openDeviceModal('${catKey}')">
                                            <i class="fas fa-cog"></i> QL Thiết bị
                                        </button>
                                    </td>`;
            } else {
                rowCat.innerHTML = `<td class="col-stt">${catKey}</td><td colspan="11">${catData.TenPhanLoai || ""}</td>`;
            }
            elements.tableBody.appendChild(rowCat);

            const itemKeys = Object.keys(catData).filter(k => !isNaN(k)).sort((a,b) => a - b);
            
            itemKeys.forEach(itemKey => {
                const item = catData[itemKey];
                const rowItem = document.createElement('tr');

                const createCell = (value, fieldName, isUploadable = false) => {
                    // 1. Cột Lịch sử BDSC (Giữ nguyên)
                    if (fieldName === 'LichSuBDSC') {
                        let content = "";
                        if (typeof value === 'object' && value !== null) {
                            content = `<button class="btn-mini btn-link" onclick="viewHistoryDetail('${catKey}', '${itemKey}')"><i class="fas fa-eye"></i> Xem Chi Tiết</button>`;
                        } else {
                            if (value && value.toString().startsWith('http')) content = `<a href="${value}" target="_blank">Xem Link</a>`;
                            else content = value || "";
                        }
                        if (localViewMode) {
                            return `<div class="cell-actions">
                                        <button class="btn-mini btn-collect" onclick="collectBDSC('${catKey}', '${itemKey}', '${item.Tagname}')"><i class="fas fa-magic"></i> Thu thập</button>
                                    </div>` + content;
                        }
                        return content;
                    }

                    // 2. Cột Tên và Tagname (Giữ nguyên logic Edit nội tuyến)
                    if (fieldName === 'TenThietBi' || fieldName === 'Tagname') {
                        if (localViewMode) {
                            return `<input type="text" class="inline-edit" value="${value || ''}" 
                                    onchange="updateInline('${catKey}', '${itemKey}', '${fieldName}', this.value)"
                                    onkeydown="if(event.key === 'Enter') this.blur()">`;
                        }
                        return value || "";
                    }

                    // --- [MỚI] XỬ LÝ HIỂN THỊ HÌNH ẢNH CUỐN SÁCH Ở CHẾ ĐỘ XEM ---
                    if (!localViewMode && isUploadable) {
                        // Kiểm tra xem có dữ liệu không
                        let hasData = false;
                        if (Array.isArray(value) && value.length > 0) hasData = true;
                        else if (typeof value === 'object' && value.url) hasData = true;
                        else if (typeof value === 'string' && value.trim() !== '') hasData = true;

                        // Nếu có dữ liệu -> Hiển thị hình ảnh
                        if (hasData) {
                            return `<img src="sach.png" 
                                    class="book-icon" 
                                    title="Nhấn để xem tài liệu"
                                    onclick="handleFileView('${catKey}', '${itemKey}', '${fieldName}')">`;
                        }
                        // Nếu rỗng -> Trả về rỗng (chạy xuống logic dưới trả về renderMultiLinkList rỗng)
                    }
                    // -------------------------------------------------------------

                    // 3. Logic hiển thị cũ (dùng cho Chế độ sửa hoặc khi không có dữ liệu ở chế độ xem)
                    let htmlContent = renderMultiLinkList(value);
                    if (localViewMode && isUploadable) {
     const toolbar = `
        <div class="cell-actions">
            <button class="btn-mini btn-link" title="Thêm link/Upload" onclick="openAddLinkMenu('${catKey}', '${itemKey}', '${fieldName}')"><i class="fas fa-link"></i></button>
            <button class="btn-mini btn-manage" title="Sửa/Xoá" onclick="openManageModal('${catKey}', '${itemKey}', '${fieldName}')"><i class="fas fa-edit"></i></button>
        </div>`;
    return toolbar + htmlContent;
}
                    return htmlContent;
                };

                rowItem.innerHTML = `
                    <td class="text-center fw-bold text-muted">${itemKey}</td>
                    <td>${createCell(item.TenThietBi, 'TenThietBi')}</td>
                    <td>${createCell(item.Tagname, 'Tagname', false)}</td> 
                    <td>${createCell(item.ThongSoKT, 'ThongSoKT', true)}</td>
                    <td>${createCell(item.Catalogue, 'Catalogue', true)}</td>
                    <td>${createCell(item.KiemDinh, 'KiemDinh', true)}</td>
                    <td>${createCell(item.QuyTrinhVH, 'QuyTrinhVH', true)}</td>
                    <td>${createCell(item.QuyTrinhBD, 'QuyTrinhBD', true)}</td>
                    <td>${createCell(item.DinhMuc, 'DinhMuc', true)}</td>
                    <td>${createCell(item.DGRR, 'DGRR', true)}</td>
                    <td>${createCell(item.BieuMau, 'BieuMau', true)}</td>
                    <td>${createCell(item.LichSuBDSC, 'LichSuBDSC')}</td>
                `;
                elements.tableBody.appendChild(rowItem);
            });
        });
    }
	
	// --- HÀM XỬ LÝ KHI CLICK VÀO HÌNH SÁCH ---
    window.handleFileView = function(catKey, itemKey, fieldName) {
        let data = localDataCache[catKey][itemKey][fieldName];
        
        // Chuẩn hóa dữ liệu về mảng
        let items = [];
        if (Array.isArray(data)) {
            items = data;
        } else if (typeof data === 'object' && data.url) {
            items = [data];
        } else if (typeof data === 'string' && data.trim() !== '') {
            items = [{ name: "Tài liệu cũ", url: data }];
        }

        if (items.length === 0) return; // Không có gì để mở

        if (items.length === 1) {
            // Trường hợp 1: Chỉ có 1 link -> Mở luôn tab mới
            window.open(items[0].url, '_blank');
        } else {
            // Trường hợp 2: Có nhiều link -> Mở Modal (dạng chỉ xem)
            const container = document.getElementById('manageListContainer');
            container.innerHTML = "";
            
            // Render danh sách
            items.forEach(item => {
                const displayName = item.name || "File không tên";
                const div = document.createElement('div');
                div.className = "read-only-item";
                div.innerHTML = `
                    <span><i class="fas fa-book text-muted me-2"></i> ${displayName}</span>
                    <a href="${item.url}" target="_blank">Mở <i class="fas fa-external-link-alt"></i></a>
                `;
                container.appendChild(div);
            });

            // Ẩn nút "Lưu" vì đây là chế độ xem
            const btnSave = document.getElementById('btnSaveManage');
            if(btnSave) btnSave.style.display = 'none';

            // Đổi tiêu đề modal
            document.querySelector('#manageModal .modal-title').innerText = "Danh sách tài liệu";
            
            elements.manageModal.show();
        }
    };
	

    // --- OTHER FUNCTIONS ---
    window.openDeviceModal = function(catKey) {
        currentCategoryForDevice = catKey;
        const tbody = document.getElementById('deviceTableBody');
        tbody.innerHTML = "";
        const catData = localDataCache[catKey];
        const itemKeys = Object.keys(catData).filter(k => !isNaN(k)).sort((a,b) => a - b);
        itemKeys.forEach(key => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="text-center fw-bold">${key}</td><td>${catData[key].TenThietBi || "(Chưa đặt tên)"}</td><td class="text-center"><button class="btn btn-danger btn-sm" style="font-size: 10px;" onclick="deleteDevice('${catKey}', '${key}')"><i class="fas fa-trash"></i></button></td>`;
            tbody.appendChild(tr);
        });
        document.getElementById('newDeviceName').value = "";
        elements.deviceModal.show();
    };

    window.addNewDevice = async function() {
        if(!currentCategoryForDevice) return;
        const name = document.getElementById('newDeviceName').value.trim();
        if(!name) { alert("Vui lòng nhập tên thiết bị/máy"); return; }
        const catData = localDataCache[currentCategoryForDevice];
        const itemKeys = Object.keys(catData).filter(k => !isNaN(k)).map(k => parseInt(k));
        const newId = itemKeys.length > 0 ? Math.max(...itemKeys) + 1 : 1;
        window.showLoading("Đang thêm...");
        try {
            await set(ref(db, `Quanlythietbi/${currentCategoryForDevice}/${newId}`), { TenThietBi: name, Tagname: "" });
            if(!localDataCache[currentCategoryForDevice]) localDataCache[currentCategoryForDevice] = {};
            localDataCache[currentCategoryForDevice][newId] = { TenThietBi: name };
            openDeviceModal(currentCategoryForDevice); renderTable(localDataCache);
        } catch(err) { alert("Lỗi: " + err.message); } finally { window.hideLoading(); }
    };

// --- HÀM THÊM PHÂN LOẠI MỚI (TỰ ĐỘNG SINH MÃ LA MÃ) ---
    window.addNewCategory = async function() {
        let nextKey = "I"; // Mặc định là I nếu chưa có dữ liệu

        // Logic tìm số La Mã tiếp theo
        if (localDataCache && Object.keys(localDataCache).length > 0) {
            let maxVal = 0;
            // Duyệt qua tất cả các Key hiện có để tìm số lớn nhất
            Object.keys(localDataCache).forEach(key => {
                const val = window.romanToInt(key);
                if (val > maxVal) maxVal = val;
            });
            // Cộng thêm 1 và chuyển lại thành số La Mã
            nextKey = window.intToRoman(maxVal + 1);
        }

        // Chỉ cần hỏi Tên phân loại (vì Mã đã tự động sinh)
        const catName = prompt(`Hệ thống đang tạo mục thứ: ${nextKey}\nNhập Tên Đơn vị sử dụng mới (Ví dụ: Tổng kho Miền Bắc...):`);
        
        if (!catName) return; // Người dùng ấn hủy hoặc để trống

        window.showLoading("Đang tạo phân loại " + nextKey + "...");
        try {
            // Gửi lên Firebase
            await set(ref(db, `Quanlythietbi/${nextKey}`), { TenPhanLoai: catName });
            
            // Cập nhật Cache
            if (!localDataCache) localDataCache = {};
            localDataCache[nextKey] = { TenPhanLoai: catName };

            renderTable(localDataCache);
            // alert("Đã thêm phân loại " + nextKey + " thành công!"); // Có thể bỏ alert cho đỡ phiền
        } catch (err) {
            alert("Lỗi: " + err.message);
        } finally {
            window.hideLoading();
        }
    };


    window.deleteDevice = async function(catKey, itemKey) {
        if(!confirm(`Bạn chắc chắn muốn xoá Thiết bị STT ${itemKey}?`)) return;
        window.showLoading("Đang xoá...");
        try {
            await remove(ref(db, `Quanlythietbi/${catKey}/${itemKey}`));
            delete localDataCache[catKey][itemKey];
            openDeviceModal(catKey); renderTable(localDataCache);
        } catch(err) { alert("Lỗi: " + err.message); } finally { window.hideLoading(); }
    };

    window.openManageModal = function(catKey, itemKey, fieldName) {
        currentManageTarget = { catKey, itemKey, fieldName };
        const container = document.getElementById('manageListContainer'); container.innerHTML = "";
        
        // --- [MỚI] Đảm bảo nút Lưu và Tiêu đề hiển thị đúng cho chế độ Quản lý ---
        const btnSave = document.getElementById('btnSaveManage');
        if(btnSave) btnSave.style.display = 'block'; // Hiện nút lưu
        document.querySelector('#manageModal .modal-title').innerText = "Quản lý Tài liệu";
        // -----------------------------------------------------------------------

        let data = localDataCache[catKey][itemKey][fieldName];
        let items = [];
        if (data) { if (typeof data === 'string') items = [{ name: "Link cũ", url: data }]; else if (Array.isArray(data)) items = [...data]; else if (typeof data === 'object') items = Object.values(data); }
        
        if(items.length === 0) container.innerHTML = "<div class='text-center text-muted'>Trống</div>";
        else {
            items.forEach((item, index) => {
                const displayName = item.name || "File";
                const row = document.createElement('div'); row.className = "manage-item-row";
                row.innerHTML = `<input type="text" class="form-control form-control-sm" value="${displayName}" id="linkName-${index}"><a href="${item.url}" target="_blank"><i class="fas fa-external-link-alt"></i></a><i class="fas fa-trash-alt manage-item-del" onclick="markDeleted(this)"></i><input type="hidden" id="linkUrl-${index}" value="${item.url}"><input type="hidden" id="linkCreated-${index}" value="${item.created || Date.now()}">`;
                container.appendChild(row);
            });
        }
        elements.manageModal.show();
    };

    window.saveManageChanges = async function() {
        if (!currentManageTarget) return;
        const { catKey, itemKey, fieldName } = currentManageTarget;
        const rows = document.querySelectorAll('#manageListContainer .manage-item-row');
        const newData = [];
        rows.forEach((row, index) => {
            if (row.classList.contains('marked-delete')) return;
            const name = row.querySelector(`#linkName-${index}`).value;
            const url = row.querySelector(`#linkUrl-${index}`).value;
            const created = row.querySelector(`#linkCreated-${index}`).value;
            if (url) newData.push({ name: name || "File", url: url, created: parseInt(created) });
        });
        window.showLoading("Đang lưu...");
        try {
            await set(ref(db, `Quanlythietbi/${catKey}/${itemKey}/${fieldName}`), newData);
            if (!localDataCache[catKey][itemKey]) localDataCache[catKey][itemKey] = {};
            localDataCache[catKey][itemKey][fieldName] = newData;
            renderTable(localDataCache); elements.manageModal.hide();
        } catch(err) { alert(err.message); } finally { window.hideLoading(); }
    };

  

    window.updateInline = function(c, i, f, v) { update(ref(db, `Quanlythietbi/${c}/${i}`), {[f]:v}); localDataCache[c][i][f]=v; };
    
    
	window.exportMainData = function() {
        if (!localDataCache) return;
        const rows = [["STT", "Tên Thiết bị/Loại", "Tagname", "Đăng ký", "Catalogue", "Kiểm định", "QT UCKC", "Quy trình BD", "Định mức", "Giấy phép", "Biểu mẫu"]];
        Object.keys(localDataCache).sort((a,b)=>window.romanToInt(a)-window.romanToInt(b)).forEach(catKey => {
            rows.push([catKey, localDataCache[catKey].TenPhanLoai]); 
            const items = localDataCache[catKey];
            Object.keys(items).filter(k=>!isNaN(k)).sort((a,b)=>a-b).forEach(key => {
                const i = items[key];
                const getVal = (v) => (typeof v === 'string') ? v : (Array.isArray(v) ? v.map(x=>x.url).join(';') : "");
                rows.push([key, i.TenThietBi, i.Tagname, getVal(i.ThongSoKT), getVal(i.Catalogue), getVal(i.KiemDinh), getVal(i.QuyTrinhVH), getVal(i.QuyTrinhBD), getVal(i.DinhMuc), getVal(i.DGRR), getVal(i.BieuMau)]);
            });
        });
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "DS"); XLSX.writeFile(wb, "Backup.xlsx");
    };
	  // Import Data (Merge Logic)
    
	   // --- HÀM XỬ LÝ NHẬP EXCEL (CẬP NHẬT CẢ TÊN PHÂN LOẠI) ---
    window.processMergeExcel = async function(jsonData) {
        if (!jsonData || jsonData.length < 2) {
            alert("File Excel không có dữ liệu hoặc thiếu dòng tiêu đề!");
            window.hideLoading();
            return;
        }

        // 1. XỬ LÝ TIÊU ĐỀ (DÒNG 0) ĐỂ TÌM VỊ TRÍ CỘT
        const headers = jsonData[0].map(h => h ? h.toString().toLowerCase().trim() : "");

        // Tìm cột Tên (Dùng chung cho Tên thiết bị và Tên phân loại)
        const nameColIdx = headers.findIndex(h => 
            h === "tên thiết bị" || h === "tên thiết bị/Loại"
        );

        // Tìm cột Tagname
        const tagColIdx = headers.findIndex(h => 
            h === "tagname" || h === "tag name"
        );

        if (nameColIdx === -1 && tagColIdx === -1) {
            alert("Lỗi: Không tìm thấy cột 'tên thiết bị' hoặc 'Tagname' hợp lệ.\nVui lòng kiểm tra lại dòng tiêu đề.");
            window.hideLoading();
            return;
        }

        const updates = {};
        let currentCatKey = "";
        let updateCount = 0;

        // 2. DUYỆT DỮ LIỆU TỪ DÒNG 1
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            const stt = row[0] ? row[0].toString().trim() : "";
            
            if (!stt) continue;

            const isItem = !isNaN(stt); // True = Thiết bị (1,2..), False = Phân loại (I, II..)

            if (!isItem) {
                // ==> PHÂN LOẠI (Category) - Ví dụ: I, II
                currentCatKey = stt; 
                
                // [MỚI] Lấy tên từ cột "Tên thiết bị" để cập nhật TenPhanLoai
                if (nameColIdx !== -1 && row[nameColIdx] !== undefined) {
                    const catName = row[nameColIdx].toString().trim();
                    if (catName) { // Chỉ cập nhật nếu có dữ liệu
                        updates[`Quanlythietbi/${currentCatKey}/TenPhanLoai`] = catName;
                        updateCount++;
                    }
                }
            } else {
                // ==> THIẾT BỊ (Item) - Ví dụ: 1, 2
                if (!currentCatKey) continue;

                const itemKey = parseInt(stt);
                const basePath = `Quanlythietbi/${currentCatKey}/${itemKey}`;
                let hasRowUpdate = false;

                // Cập nhật Tên thiết bị
                if (nameColIdx !== -1 && row[nameColIdx] !== undefined) {
                    const val = row[nameColIdx].toString().trim();
                    updates[`${basePath}/TenThietBi`] = val;
                    hasRowUpdate = true;
                }

                // Cập nhật Tagname
                if (tagColIdx !== -1 && row[tagColIdx] !== undefined) {
                    const val = row[tagColIdx].toString().trim();
                    updates[`${basePath}/Tagname`] = val;
                    hasRowUpdate = true;
                }

                if (hasRowUpdate) updateCount++;
            }
        }

        // 3. GỬI CẬP NHẬT
        if (Object.keys(updates).length > 0) {
            try {
                await update(ref(db), updates);
                await loadAllData();
                alert(`Đã cập nhật thành công ${updateCount} mục (bao gồm Phân loại & Thiết bị)!`);
            } catch (err) {
                console.error(err);
                alert("Lỗi lưu dữ liệu: " + err.message);
            }
        } else {
            alert("Không tìm thấy dữ liệu phù hợp để cập nhật.");
        }
        
        window.hideLoading();
    };
	
	document.getElementById('fileInputExcel').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        showLoading("Đang xử lý nhập liệu...");
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const wb = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
                const ws = wb.Sheets[wb.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(ws, {header: 1, defval: ""});
                processMergeExcel(jsonData);
            } catch (err) { alert(err.message); hideLoading(); }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = ""; // Reset
    });
	

    window.collectBDSC = async function(catKey, itemKey, tagName) {
        if (!tagName) { alert("Chưa có Tagname!"); return; }
        window.showLoading("Đang quét...");
        try {
            const lockedSnapshot = await get(ref(db, 'settings/global/lockedYears'));
            const lockedYears = lockedSnapshot.val() || {};
            const activeYears = TARGET_YEARS.filter(y => lockedYears[y] !== true);
            let collectedData = {}; let found = false;
            for (let year of activeYears) {
                const snapshot = await get(ref(db, `congViecMe${year}`));
                if (!snapshot.exists()) continue;
                const sourceMap = { [year]: snapshot.val() };
                const res = searchHistoryInMemory(sourceMap, tagName);
                if(res) { collectedData[year] = res[year]; found = true; }
            }
            if (found) {
                const current = localDataCache[catKey][itemKey].LichSuBDSC || {};
                Object.assign(current, collectedData);
                await update(ref(db, `Quanlythietbi/${catKey}/${itemKey}`), { LichSuBDSC: current });
                localDataCache[catKey][itemKey]['LichSuBDSC'] = current;
                renderTable(localDataCache);
                alert("Đã thu thập!");
            } else alert("Không tìm thấy dữ liệu mới.");
        } catch (e) { alert(e.message); } finally { window.hideLoading(); }
    };

    window.batchCollectBDSC = async function() {
        if(!confirm("Cập nhật TOÀN BỘ?")) return;
        window.showLoading("Đang xử lý...");
        try {
            const lockedSnapshot = await get(ref(db, 'settings/global/lockedYears'));
            const lockedYears = lockedSnapshot.val() || {};
            const activeYears = TARGET_YEARS.filter(y => lockedYears[y] !== true);
            const sourceData = {};
            for(let year of activeYears) {
                const snap = await get(ref(db, `congViecMe${year}`));
                if(snap.exists()) sourceData[year] = snap.val();
            }
            const updates = {};
            for(const catKey in localDataCache) {
                const items = localDataCache[catKey];
                for(const itemKey in items) {
                    if(isNaN(itemKey)) continue;
                    const item = items[itemKey];
                    if(!item.Tagname) continue;
                    const found = searchHistoryInMemory(sourceData, item.Tagname);
                    if(found) {
                        const current = item.LichSuBDSC || {};
                        Object.assign(current, found);
                        updates[`Quanlythietbi/${catKey}/${itemKey}/LichSuBDSC`] = current;
                    }
                }
            }
            if(Object.keys(updates).length > 0) { await update(ref(db), updates); await loadAllData(); alert("Xong!"); } 
            else alert("Không có dữ liệu mới.");
        } catch(e) { alert(e.message); } finally { window.hideLoading(); }
    };

    // --- THAY THẾ HÀM searchHistoryInMemory CŨ BẰNG HÀM NÀY ---
function searchHistoryInMemory(sourceData, tagName) {
    let result = {}; 
    let hasData = false;

    // Cấp 1: Duyệt theo Năm
    for(const [year, yearData] of Object.entries(sourceData)) {
        
        // Cấp 2: Duyệt theo Nhóm công việc
        for(const gData of Object.values(yearData)) {
            if(!gData.children) continue;

            // Cấp 3: Duyệt theo Thiết bị (Children - Level 2)
            for(const cData of Object.values(gData.children)) {
                
                // Ở đây KHÔNG CÒN kiểm tra tagName nữa, chỉ kiểm tra xem có grandchildren hay không
                if(!cData.grandchildren) continue;

                // Cấp 4: Duyệt Grandchildren (Level 3) -> NƠI CHỨA TAGNAME MỚI
                for(const [grandId, grData] of Object.entries(cData.grandchildren)) {
                    
                    // BỘ LỌC ĐÃ ĐƯỢC CHUYỂN XUỐNG ĐÂY: Kiểm tra đúng Tagname và Đã thực hiện
                    if (grData.tagName && grData.tagName.trim() === tagName.trim() && grData.daThucHien === true) {

                        // Kiểm tra tồn tại cấp 5 (greatGrandchildren) để đi tiếp
                        if(grData.greatGrandchildren) {
                            
                            // Cấp 5: Duyệt GreatGrandchildren (Đây là node chứa ID như "1,1", "3,2"...)
                            for(const [ggId, ggData] of Object.entries(grData.greatGrandchildren)) {
                                
                                // --- LOGIC LẤY ODDO GIỮ NGUYÊN ---
                                let oddoVal = "";
                                if (ggData.tgHoanThanh !== undefined && ggData.tgHoanThanh !== null) {
                                    oddoVal = ggData.tgHoanThanh;
                                } else if (ggData.TgHoanThanh !== undefined && ggData.TgHoanThanh !== null) {
                                    oddoVal = ggData.TgHoanThanh;
                                }

                                if (oddoVal !== "") {
                                    console.log(`Đã tìm thấy ODO: ${oddoVal} tại năm ${year}, ID: ${ggId}`);
                                }
                                // -----------------------------------------------

                                // === TRƯỜNG HỢP A: Dữ liệu dừng ở Cấp 5 (Có executions) ===
                                if(ggData.executions) {
                                    const entryId = `${grandId}_${ggId}`;
                                    const details = {};
                                    for(const [k, v] of Object.entries(ggData.executions)) { 
                                        if(!isNaN(k) && typeof v === 'object') details[k] = v; 
                                    }

                                    if(!result[year]) result[year] = {};
                                    result[year][entryId] = { 
                                        noiDung: ggData.noiDung || "N/A", 
                                        parentContent: null, 
                                        details: details,
                                        level: 5,
                                        oddo: oddoVal // Gán ODO vào kết quả
                                    };
                                    hasData = true;
                                }

                                // === TRƯỜNG HỢP B: Dữ liệu sâu xuống Cấp 6 (GreatGreatGrandchildren) ===
                                if (ggData.daThucHien === true && ggData.greatGreatGrandchildren) {
                                    
                                    for (const [gggId, gggData] of Object.entries(ggData.greatGreatGrandchildren)) {
                                        if (gggData.executions) {
                                            const entryId = `${grandId}_${ggId}_${gggId}`;
                                            const details = {};
                                            for(const [k, v] of Object.entries(gggData.executions)) { 
                                                if(!isNaN(k) && typeof v === 'object') details[k] = v; 
                                            }

                                            if(!result[year]) result[year] = {};
                                            
                                            result[year][entryId] = { 
                                                noiDung: gggData.noiDung || "N/A", 
                                                parentContent: ggData.noiDung || "Công việc cha", 
                                                details: details,
                                                level: 6,
                                                oddo: oddoVal // Cấp 6 thừa hưởng ODO của cha (Cấp 5)
                                            };
                                            hasData = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return hasData ? result : null;
}

    // Cấu hình URL của Google Apps Script từ luudrive
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwlfEd9fnn3JoG9zdSoDm_k5JVV-NJpH0PqA1_FjbuG9DssaEOvmBnwBkC4kjM8qkAU/exec";

// Hàm trigger không cần kiểm tra accessToken của OAuth nữa
window.triggerUpload = function(c, i, f) { 
    currentUploadTarget = {c, i, f}; 
    elements.driveInput.click(); 
};

elements.driveInput.addEventListener('change', (e) => {
    const f = e.target.files[0]; 
    if(!f) return;
    
    const {c, i, f: fd} = currentUploadTarget;
    const name = prompt("Nhập tên hiển thị cho file này:", f.name); 
    if(!name) { 
        elements.driveInput.value = ""; 
        return; 
    }

    // Chặn tệp quá kích thước 50MB
    if(f.size > 1024 * 1024 * 50) {
        alert('Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 50MB.');
        elements.driveInput.value = "";
        return;
    }

    window.showLoading("Đang xác thực và tải lên...");
    const reader = new FileReader();
    
    reader.onload = function(event) {
        // Tách lấy chuỗi mã hóa Base64
        const base64Data = event.target.result.split(',')[1];

        // Gọi grecaptcha thông qua biến toàn cục
        grecaptcha.ready(function() {
            grecaptcha.execute(window.RECAPTCHA_SITE_KEY, {action: 'upload'}).then(async function(token) {
                const formData = new FormData();
                formData.append('fileName', f.name);
                formData.append('mimeType', f.type);
                formData.append('fileData', base64Data);
                formData.append('recaptchaToken', token);

                try {
                    const response = await fetch(WEB_APP_URL, {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    
                    if (result.status === "success") {
                        // Nhúng logic lưu Firebase của trang tb
                        let arr = localDataCache[c][i][fd] || []; 
                        if(!Array.isArray(arr)) arr = arr.url ? [arr] : [];
                        arr.push({name: name, url: result.url, created: Date.now()});
                        
                        await set(ref(db, `Quanlythietbi/${c}/${i}/${fd}`), arr);
                        localDataCache[c][i][fd] = arr; 
                        renderTable(localDataCache);
                        
                        alert("Tải lên thành công!");
                    } else {
                        throw new Error(result.message);
                    }
                } catch(error) { 
                    alert("Lỗi khi tải tệp: " + error.message); 
                } finally { 
                    window.hideLoading(); 
                    elements.driveInput.value = ""; 
                }
            });
        });
    };

    reader.onerror = function() {
        alert("Không thể đọc tệp.");
        window.hideLoading();
        elements.driveInput.value = "";
    };

    reader.readAsDataURL(f);
});

    // Biến lưu trữ tạm thời tọa độ ô dữ liệu khi mở menu
let currentAddLinkTarget = null;

// Hàm 1: Mở Menu gộp
window.openAddLinkMenu = function(c, i, f) {
    currentAddLinkTarget = {c, i, f};
    // Làm sạch dữ liệu cũ trên form
    document.getElementById('manualLinkName').value = "";
    document.getElementById('manualLinkUrl').value = "";
    elements.addLinkModal.show();
};

// Hàm 2: Xử lý khi nhấn "Lưu Link" (Nhập URL thủ công)
window.saveManualLink = async function() {
    if (!currentAddLinkTarget) return;
    
    const name = document.getElementById('manualLinkName').value.trim();
    const url = document.getElementById('manualLinkUrl').value.trim();
    
    if (!url) { 
        alert("Vui lòng nhập đường link!"); 
        return; 
    }
    
    const finalName = name || "File";
    const {c, i, f} = currentAddLinkTarget;
    
    let arr = localDataCache[c][i][f] || []; 
    if(!Array.isArray(arr)) arr = arr.url ? [arr] : [];
    
    arr.push({name: finalName, url: url, created: Date.now()});
    
    window.showLoading("Đang lưu link...");
    try {
        await set(ref(db, `Quanlythietbi/${c}/${i}/${f}`), arr); 
        localDataCache[c][i][f] = arr; 
        renderTable(localDataCache);
        elements.addLinkModal.hide(); // Đóng menu khi thành công
    } catch (err) {
        alert("Lỗi: " + err.message);
    } finally {
        window.hideLoading();
    }
};

// Hàm 3: Xử lý khi nhấn "Chọn file" (Kích hoạt luồng Upload)
window.triggerCombinedUpload = function() {
    // 1. Đóng menu Thêm Link lại để dừng tác vụ nhập URL
    elements.addLinkModal.hide();
    
    // 2. Chuyển thông tin tọa độ ô sang biến cấu hình của luồng Upload
    currentUploadTarget = currentAddLinkTarget; 
    
    // 3. Kích hoạt mở cửa sổ browse file (luồng event listener của driveInput sẽ tiếp quản phần còn lại)
    elements.driveInput.click();
};

    // ---  Bộ 4 hàm thay thế cho hàm exportCurrentHistory cũ để xuất excel theo ExcelJS ---
// --- 1. HÀM MỞ MODAL LỰA CHỌN (Gán vào nút Xuất Excel trên giao diện) ---
    window.exportCurrentHistory = function() {
        if (!currentHistoryData) {
            alert("Không có dữ liệu để xuất!");
            return;
        }
        
        // Reset form về mặc định
        document.getElementById('optAll').checked = true;
        document.getElementById('optYear').checked = false;
        
        // Cài đặt năm hiện tại
        const yearInput = document.getElementById('exportYearInput');
        yearInput.value = new Date().getFullYear();
        yearInput.disabled = true; // Mặc định disable vì chọn optAll

        // Hiển thị Modal
        const modal = new bootstrap.Modal(document.getElementById('exportOptionsModal'));
        modal.show();
    };

    // --- 2. HÀM UI: BẬT/TẮT Ô NHẬP NĂM ---
    window.toggleYearInput = function() {
        const isYearOpt = document.getElementById('optYear').checked;
        const input = document.getElementById('exportYearInput');
        input.disabled = !isYearOpt;
        if (isYearOpt) input.focus();
    };

    // --- 3. HÀM XỬ LÝ KHI ẤN NÚT "XUẤT FILE" TRONG MODAL ---
    window.confirmExportProcess = function() {
        const isAll = document.getElementById('optAll').checked;
        let dataToExport = {};
        let fileNameSuffix = "";

        if (isAll) {
            // Lựa chọn 1: Lấy toàn bộ
            dataToExport = currentHistoryData;
        } else {
            // Lựa chọn 2: Lọc theo năm
            const yearVal = document.getElementById('exportYearInput').value;
            if (!yearVal) { alert("Vui lòng nhập năm!"); return; }
            
            // Kiểm tra xem năm đó có dữ liệu không
            if (currentHistoryData[yearVal]) {
                dataToExport[yearVal] = currentHistoryData[yearVal];
                fileNameSuffix = "_" + yearVal; // Thêm hậu tố năm vào tên file
            } else {
                alert(`Không tìm thấy dữ liệu lịch sử của năm ${yearVal}!`);
                return;
            }
        }

        // Ẩn modal sau khi chọn xong
        const modalEl = document.getElementById('exportOptionsModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        // Gọi hàm tạo Excel với dữ liệu đã lọc
        runExcelGenerator(dataToExport, fileNameSuffix);
    };

    // --- 4. HÀM TẠO EXCEL (CORE LOGIC) ---
    // (Đã được tách ra để nhận dữ liệu input)
    window.runExcelGenerator = async function(dataSource, nameSuffix = "") {
    const workbook = new ExcelJS.Workbook();

    // Xử lý tên Sheet và File
    let rawTag = window.currentDeviceTag || "NoTag";
    let safeTag = rawTag.replace(/[\\/?*\[\]:]/g, '_');
    let sheetName = `LS_${safeTag}${nameSuffix}`;
    if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);

    const worksheet = workbook.addWorksheet(sheetName);

    // Cấu hình Sheet
    worksheet.views = [{ state: 'frozen', ySplit: 2 }];
    worksheet.columns = [
        { header: 'STT', key: 'stt', width: 6, style: { alignment: { horizontal: 'center' } } },
        { header: 'Ngày', key: 'date', width: 12, style: { alignment: { horizontal: 'center' } } },
        { header: 'Nội dung công việc', key: 'content', width: 50, style: { alignment: { wrapText: true } } },
        { header: 'SL', key: 'unit', width: 8, style: { alignment: { horizontal: 'center' } } },
        { header: 'Đơn giá', key: 'price', width: 15, style: { numFmt: '#,##0' } },
        { header: 'Thành tiền', key: 'total', width: 18, style: { numFmt: '#,##0' } },
        { header: 'Hồ sơ', key: 'link', width: 15, style: { alignment: { horizontal: 'center' }, font: { color: { argb: '0000FF' }, underline: true } } }
    ];

    // Header Style
    const headerRow = worksheet.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '217346' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Dòng Tổng toàn bảng
    const grandTotalRow = worksheet.addRow([]);
    grandTotalRow.height = 22;
    worksheet.mergeCells('A2:E2'); // Cập nhật gộp cột do đã bớt 1 cột
    const labelCell = grandTotalRow.getCell(1);
    labelCell.value = "TỔNG GIÁ TRỊ TOÀN BẢNG:";
    labelCell.font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'right' };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B03A2E' } };

    const grandTotalValueCell = grandTotalRow.getCell(6); // Cột thành tiền giờ là cột 6 (F)
    grandTotalValueCell.font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
    grandTotalValueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B03A2E' } };
    grandTotalValueCell.numFmt = '#,##0';

    // XỬ LÝ DỮ LIỆU
    const sortedYears = Object.keys(dataSource).sort().reverse();
    let yearTotalCellAddresses = [];

    sortedYears.forEach(year => {
        let rawItems = [];
        let parentRowAddressesInYear = [];
        let currentYearSTT = 1;

        Object.values(dataSource[year]).forEach(t => {
            if (t.details) {
                Object.values(t.details).forEach(d => {
                    let groupName = t.parentContent ? t.parentContent : t.noiDung;
                    let childName = t.parentContent ? t.noiDung : "(Chi tiết)";
                    rawItems.push({
                        date: d.ngayThucHien || "", 
                        groupName: groupName, childName: childName,
                        quantity: Number(d.dvt) || 0, price: Number(d.donGia) || 0,
                        link: d.hoSoLink || ""
                    });
                });
            }
        });

        let groups = {};
        rawItems.forEach(item => {
            let key = `${item.date}__${item.groupName}`;
            if (!groups[key]) groups[key] = { date: item.date, name: item.groupName, children: [] };
            groups[key].children.push(item);
        });
        let sortedGroups = Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));

        sortedGroups.forEach(grp => {
            const parentRow = worksheet.addRow({
                stt: currentYearSTT++, date: grp.date,
                content: grp.name, // Đã xóa toUpperCase(), giữ nguyên chữ gốc
                unit: "", price: "", total: 0, link: ""
            });
            parentRow.eachCell((cell, col) => {
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFEFEF' } };
                if(col === 6) cell.font = { bold: true, color: { argb: 'C0392B' } };
            });

            const firstChildRow = parentRow.number + 1;
            grp.children.forEach(c => {
                const childRow = worksheet.addRow({
                    stt: "", date: "", 
                    content: "     • " + c.childName,
                    unit: c.quantity, price: c.price, total: 0,
                    link: c.link ? { text: 'Xem Link', hyperlink: c.link } : ""
                });
                childRow.getCell('content').font = { italic: true, color: { argb: '555555' } };
                const r = childRow.number;
                childRow.getCell('total').value = { formula: `D${r}*E${r}` }; // Công thức dịch sang D*E
            });

            const lastChildRow = worksheet.lastRow.number;
            if (lastChildRow >= firstChildRow) {
                parentRow.getCell('total').value = { formula: `SUM(F${firstChildRow}:F${lastChildRow})` }; // Cột tính tổng dịch về F
                parentRowAddressesInYear.push(`F${parentRow.number}`);
            }
        });

        if (parentRowAddressesInYear.length > 0) {
            const yearTotalRow = worksheet.addRow({
                stt: "", date: "", content: `TỔNG CỘNG NĂM ${year}`,
                unit: "", price: "", total: 0, link: ""
            });
            yearTotalRow.eachCell((cell) => {
                cell.font = { bold: true, color: { argb: '9C6500' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2CC' } };
                cell.border = { top: { style: 'double' }, bottom: { style: 'thin' } };
            });
            yearTotalRow.getCell('content').alignment = { horizontal: 'right' };
            yearTotalRow.getCell('total').value = { formula: `SUM(${parentRowAddressesInYear.join(',')})` };
            yearTotalCellAddresses.push(`F${yearTotalRow.number}`);
        }
    });

    if (yearTotalCellAddresses.length > 0) {
        grandTotalValueCell.value = { formula: `SUM(${yearTotalCellAddresses.join(',')})` };
    } else {
        grandTotalValueCell.value = 0;
    }

    const lastRow = worksheet.lastRow.number;
    for (let i = 1; i <= lastRow; i++) {
        const row = worksheet.getRow(i);
        row.eachCell({ includeEmpty: true }, (cell) => {
            if (!cell.border || !cell.border.top || cell.border.top.style !== 'double') {
                cell.border = Object.assign({}, cell.border, {
                    top: { style: 'thin', color: { argb: 'CCCCCC' } },
                    left: { style: 'thin', color: { argb: 'CCCCCC' } },
                    bottom: { style: 'thin', color: { argb: 'CCCCCC' } },
                    right: { style: 'thin', color: { argb: 'CCCCCC' } }
                });
            }
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;

    let safeFileNameTag = (window.currentDeviceTag || "NoTag").replace(/[^a-zA-Z0-9-_]/g, '_');
    anchor.download = `Lichsu_BDSC_${safeFileNameTag}${nameSuffix}.xlsx`;
    
    anchor.click();
    window.URL.revokeObjectURL(url);
};
// ------ Hết bộ 4 hàm thay thế  -------

    // --- REVERTED TOOLTIP LOGIC (Use 'title' attribute) ---
    function renderMultiLinkList(d) {
        if(!d || typeof d !== 'object' || (!Array.isArray(d) && !d.url)) return "";
        let items = Array.isArray(d) ? [...d].reverse() : [d];
        if(!Array.isArray(d) && d.noiDung) return ""; 
        if(items.length===0) return "";
        let h = '<div class="multi-link-box">';
        items.forEach(l => { 
            // Use browser native tooltip (title)
            if(l.url) h+=`<div class="link-item"><i class="fas fa-caret-right text-muted" style="font-size:10px;"></i> <a href="${l.url}" target="_blank" title="${l.name||"File"}">${l.name||"File"}</a></div>`; 
        });
        return h + '</div>';
    }
	
	// --- CHỨC NĂNG BACKUP (XUẤT JSON) ---
    window.backupData = function() {
        if (!localDataCache) {
            alert("Chưa có dữ liệu để sao lưu!");
            return;
        }
        
        // Chuyển dữ liệu thành chuỗi JSON đẹp (indent 2 spaces)
        const jsonStr = JSON.stringify(localDataCache, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        // Tạo link ảo để tải về
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0,10);
        a.download = `Backup_QuanLyThietBi_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- CHỨC NĂNG RESTORE (PHỤC HỒI TỪ JSON) ---
    // Bắt sự kiện chọn file JSON
    document.getElementById('jsonInputRestore').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Cảnh báo quan trọng
        const confirmMsg = "CẢNH BÁO: Hành động này sẽ XOÁ BỎ toàn bộ dữ liệu hiện tại và thay thế bằng dữ liệu trong file backup.\n\nBạn có chắc chắn muốn tiếp tục không?";
        if (!confirm(confirmMsg)) {
            e.target.value = ""; // Reset input
            return;
        }

        window.showLoading("Đang phục hồi dữ liệu...");
        const reader = new FileReader();
        reader.onload = async function(event) {
            try {
                const jsonData = JSON.parse(event.target.result);
                
                // Kiểm tra sơ bộ cấu trúc (tùy chọn)
                if (typeof jsonData !== 'object' || jsonData === null) {
                    throw new Error("File JSON không hợp lệ!");
                }

                // Gửi lên Firebase (Set đè lên node Quanlythietbi)
                await set(ref(db, 'Quanlythietbi'), jsonData);
                
                // Tải lại dữ liệu
                await loadAllData();
                alert("Phục hồi dữ liệu thành công!");

            } catch (err) {
                console.error(err);
                alert("Lỗi khi phục hồi: " + err.message);
            } finally {
                window.hideLoading();
                e.target.value = ""; // Reset input
            }
        };
        reader.readAsText(file);
    });
	// --- THAY THẾ HÀM viewHistoryDetail CŨ ---
	window.viewHistoryDetail = function(catKey, itemKey) {
    currentHistoryData = localDataCache[catKey][itemKey]['LichSuBDSC'];
    window.currentDeviceTag = localDataCache[catKey][itemKey]['Tagname'] || "Khong_Tagname";
    const devName = localDataCache[catKey][itemKey]['TenThietBi'];
    const container = document.getElementById('historyModalBody'); 
    container.innerHTML = "";
    document.getElementById('historyModalTitle').innerText = `Lịch sử BDSC: ${devName}`;

    if(!currentHistoryData) { 
        container.innerHTML = "<div class='text-center p-3'>Chưa có dữ liệu lịch sử.</div>"; 
        elements.historyModal.show(); 
        return; 
    }
    
    // Duyệt qua các năm
    Object.keys(currentHistoryData).sort().reverse().forEach(year => {
        let yearTotal = 0;
        let rawItems = [];

        // 1. CHUẨN HÓA DỮ LIỆU ĐẦU VÀO (Không còn lấy ODO)
        Object.values(currentHistoryData[year]).forEach(t => {
            if(t.details) {
                Object.values(t.details).forEach(d => {
                    yearTotal += Number(d.thanhTien || 0);
                    
                    let groupName = t.parentContent ? t.parentContent : t.noiDung;
                    let childName = t.parentContent ? t.noiDung : ""; 

                    rawItems.push({
                        date: d.ngayThucHien || "",
                        groupName: groupName,
                        childName: childName,
                        unit: d.dvt || "",
                        price: Number(d.donGia || 0),
                        total: Number(d.thanhTien || 0),
                        link: d.hoSoLink || ""
                    });
                });
            }
        });

        // 2. GOM NHÓM (GROUPING)
        let groups = {};
        rawItems.forEach(item => {
            let key = `${item.date}__${item.groupName}`;
            if (!groups[key]) {
                groups[key] = {
                    date: item.date,
                    name: item.groupName,
                    total: 0,
                    children: []
                };
            }
            groups[key].total += item.total;
            groups[key].children.push(item);
        });

        let sortedGroups = Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));

        // 3. RENDER HTML 
        let html = `<div class="history-year-block">
            <div class="history-year-title d-flex justify-content-between align-items-center">
                <span><i class="fas fa-calendar-alt me-2"></i>NĂM ${year}</span>
                <span style="color: #c0392b; font-size: 14px; margin-right: 18px;">
                    TỔNG NĂM: ${window.formatNum(yearTotal)}
                </span>
            </div>
            <table class="history-detail-table">
                <thead>
                    <tr>
                        <th class="col-hist-date">Ngày</th>
                        <th class="col-hist-content">Nội dung công việc</th>
                        <th class="col-hist-unit">SL</th>
                        <th class="col-hist-price">Đơn giá</th>
                        <th class="col-hist-total">Thành tiền</th>
                        <th class="col-hist-link">HS</th>
                    </tr>
                </thead>
                <tbody>`;

        if (sortedGroups.length === 0) {
            html += `<tr><td colspan="6" class="text-center text-muted">Không có chi tiết</td></tr>`;
        } else {
            sortedGroups.forEach(grp => {
                // --- DÒNG TỔNG CỦA NHÓM (CHA) ---
                html += `<tr class="hist-group-row">
            <td class="text-center">${grp.date}</td>
            <td colspan="3">${grp.name}</td>
            <td class="text-end text-danger">${window.formatNum(grp.total)}</td>
            <td></td>
         </tr>`;
                
                // --- CÁC DÒNG CHI TIẾT (CON) ---
                grp.children.forEach(child => {
                    let displayName = child.childName ? `<i class="fas fa-level-up-alt fa-rotate-90 me-2"></i> ${child.childName}` : `<span class="text-muted small">Chi tiết:</span>`;

                    html += `<tr class="hist-child-row">
                                <td></td> 
                                <td class="hist-child-content">${displayName}</td>
                                <td class="text-center">${child.unit}</td>
                                <td class="text-end text-muted">${window.formatNum(child.price)}</td>
                                <td class="text-end">${window.formatNum(child.total)}</td>
                                <td class="text-center">
                                    ${child.link ? `<a href="${child.link}" target="_blank"><i class="fas fa-link"></i></a>` : ''}
                                </td>
                             </tr>`;
                });
            });
        }

        html += `</tbody></table></div>`;
        container.innerHTML += html;
    });

    elements.historyModal.show();
};
// Kết thúc hàm viewHistoryDetail