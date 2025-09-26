// app.js (File JavaScript riêng biệt)

// --- 1. CẤU HÌNH API VÀ BIẾN SỐ ---
const CLIENT_ID = '588583798336-o4gjnfqaupmmdp8mi38o9m8r4n0bbghs.apps.googleusercontent.com';
const FOLDER_ID = '1uyHJHfNFLIdPQbYu1uF4zliORCM6QK3P'; // ID folder Dữ liệu Bán Hàng
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file'; 
const LOCAL_STORAGE_KEY = 'pdfLinksHistory';

// Biến UI
const authButton = document.getElementById('auth-button');
const uploadButton = document.getElementById('upload-button');
const fileInput = document.getElementById('pdf-file-input');
const uploadStatus = document.getElementById('upload-status');
const newFileLinkDiv = document.getElementById('new-file-link');
const historyListDiv = document.getElementById('history-list');
const downloadHistoryButton = document.getElementById('download-history-button');

// --- 2. KHỞI TẠO VÀ XÁC THỰC (AUTHENTICATION) ---

// Khởi tạo thư viện Google API
function handleClientLoad() {
    gapi.load('client:auth2', initClient);
}

// Khởi tạo Client OAuth
function initClient() {
    gapi.client.init({
        clientId: CLIENT_ID,
        scope: SCOPES,
        discoveryDocs: DISCOVERY_DOCS
    }).then(() => {
        const authInstance = gapi.auth2.getAuthInstance();
        
        // Lắng nghe trạng thái đăng nhập
        authInstance.isSignedIn.listen(updateSigninStatus);

        // Cập nhật trạng thái ban đầu
        updateSigninStatus(authInstance.isSignedIn.get());

        // Gán sự kiện
        authButton.onclick = handleAuthClick;
        uploadButton.onclick = handleUploadClick;
        fileInput.onchange = () => {
            uploadButton.disabled = !fileInput.files.length;
        };
        downloadHistoryButton.onclick = downloadHistory;

    }, (error) => {
        uploadStatus.textContent = 'Lỗi khởi tạo API: ' + JSON.stringify(error);
        console.error("Lỗi khởi tạo Google API Client:", error);
    });
}

// Cập nhật giao diện dựa trên trạng thái đăng nhập
function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('upload-section').style.display = 'block';
        document.getElementById('history-section').style.display = 'block';
        loadHistoryFromLocalStorage();
    } else {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('upload-section').style.display = 'none';
        document.getElementById('history-section').style.display = 'none';
    }
}

// Xử lý click nút đăng nhập
function handleAuthClick() {
    gapi.auth2.getAuthInstance().signIn();
}

// --- 3. CHỨC NĂNG TẢI LÊN FILE & LẤY LINK ---

async function handleUploadClick() {
    const file = fileInput.files[0];
    if (!file) return;

    uploadStatus.textContent = `Đang tải lên "${file.name}"... Vui lòng chờ...`;
    newFileLinkDiv.innerHTML = '';
    uploadButton.disabled = true;

    try {
        const accessToken = gapi.auth.getToken().access_token;
        if (!accessToken) throw new Error('Không lấy được Access Token. Vui lòng đăng nhập lại.');
        
        // A. Tải lên file bằng cách sử dụng Fetch API với uploadType=multipart
        const fileMetadata = {
            'name': file.name,
            'parents': [FOLDER_ID], // Thư mục đích
            'mimeType': file.type // Loại file (application/pdf)
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
        form.append('file', file);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({
                'Authorization': 'Bearer ' + accessToken
            }),
            body: form
        });

        const uploadedFile = await response.json();
        const fileId = uploadedFile.id;

        if (!fileId) throw new Error('Tải lên thất bại hoặc không nhận được ID file.');

        // B. Thiết lập quyền chia sẻ công khai ("Anyone with the link can view")
        await gapi.client.drive.permissions.create({
            fileId: fileId,
            resource: {
                'type': 'anyone',
                'role': 'reader'
            }
        });

        // C. Lấy đường dẫn xem (webViewLink)
        const getFileResponse = await gapi.client.drive.files.get({
            fileId: fileId,
            fields: 'webViewLink, name' 
        });

        const fileLink = getFileResponse.result.webViewLink;
        const fileName = getFileResponse.result.name;
        const linkHTML = `<a href="${fileLink}" target="_blank">${fileName}</a> (Tải lên thành công!)`;

        newFileLinkDiv.innerHTML = linkHTML;
        uploadStatus.textContent = `Tải lên và chia sẻ hoàn tất: ${fileName}`;
        uploadButton.disabled = false;
        fileInput.value = ''; 

        // D. Lưu đường dẫn vào Local Storage và cập nhật lịch sử
        saveLinkToLocalStorage(fileName, fileLink);

    } catch (error) {
        console.error("LỖI TẢI LÊN FILE:", error);
        uploadStatus.textContent = 'LỖI TẢI LÊN: ' + (error.result && error.result.error ? error.result.error.message : error.message || 'Lỗi không xác định.');
        uploadButton.disabled = false;
    }
}

// --- 4. QUẢN LÝ LOCAL STORAGE ---

// Lưu đường dẫn
function saveLinkToLocalStorage(name, link) {
    let history = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const newEntry = { name: name, link: link, date: new Date().toLocaleString() };
    history.unshift(newEntry); 
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
    loadHistoryFromLocalStorage(); 
}

// Tải và hiển thị lịch sử
function loadHistoryFromLocalStorage() {
    const history = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    historyListDiv.innerHTML = '';

    if (history.length === 0) {
        historyListDiv.innerHTML = '<p>Chưa có đường dẫn nào được lưu trữ trong bộ nhớ trình duyệt này.</p>';
        return;
    }

    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'file-link';
        div.innerHTML = `<a href="${item.link}" target="_blank">${item.name}</a> <span style="font-size: small; color: #888;">(${item.date})</span>`;
        historyListDiv.appendChild(div);
    });
}

// Cho phép người dùng tải về file TXT
function downloadHistory() {
    const history = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    if (history.length === 0) {
        alert('Không có lịch sử đường dẫn để tải về.');
        return;
    }
    
    let text = "--- LỊCH SỬ ĐƯỜNG DẪN PDF GOOGLE DRIVE ---\n\n";
    history.forEach(item => {
        text += `[${item.date}] ${item.name}:\n${item.link}\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lich_su_duong_dan_pdf.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Khởi động ứng dụng
window.onload = handleClientLoad;
