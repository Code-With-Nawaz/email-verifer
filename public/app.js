function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (file) {
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();

        // Event listener to track progress
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                console.log(`Uploading: ${percentComplete.toFixed(2)}%`);
            }
        });

        // Event listener to handle the response
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                console.log('File uploaded:', data);
                alert('File uploaded successfully!');
                
                // Refresh the page after the alert is shown
                window.location.reload();
            } else {
                console.error('Error uploading file:', xhr.statusText);
                alert('Error uploading file. Please try again.');
            }
        });

        // Event listener to handle errors
        xhr.addEventListener('error', () => {
            console.error('Network error during file upload.');
            alert('Network error during file upload. Please try again.');
        });

        // Configure and send the request
        xhr.open('POST', '/upload');
        xhr.send(formData);

        // Alert that file is uploading
        alert('Uploading file...');
    } else {
        console.error('No file selected.');
    }
}
