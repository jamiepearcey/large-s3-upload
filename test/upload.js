async function uploadFile(file) {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
    const fileId = Math.random().toString(36).substring(2); // Generate unique file ID
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    const uploadChunk = async (chunk, chunkNumber) => {
        const formData = new FormData();
        formData.append("file_id", fileId);
        formData.append("chunk_number", chunkNumber);
        formData.append("file", chunk);

        const response = await fetch("http://localhost:8000/api/upload_chunk/", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Failed to upload chunk ${chunkNumber}`);
        }
    };

    const uploadChunks = async () => {
        const promises = [];
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            promises.push(uploadChunk(chunk, i));
        }
        await Promise.all(promises);
    };

    const completeUpload = async () => {
        const response = await fetch("http://localhost:8000/api/complete_upload/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                file_id: fileId,
                filename: file.name,
            }),
        });

        if (!response.ok) {
            throw new Error("Failed to complete upload");
        }

        const result = await response.json();
        console.log("Upload complete:", result);
    };

    try {
        console.log("Starting upload...");
        await uploadChunks();
        console.log("All chunks uploaded. Finalizing...");
        await completeUpload();
        console.log("Upload complete!");
    } catch (error) {
        console.error("Upload failed:", error);
    }
}

// Event listener for file upload
document.getElementById("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
        uploadFile(file);
    }
});
