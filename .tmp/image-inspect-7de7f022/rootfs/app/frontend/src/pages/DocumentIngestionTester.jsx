import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../styles/ingestion-tester.css';

function DocumentIngestionTester() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.includes('pdf')) {
        setError('Please select a PDF file');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:7071/api/extractDocument', {
        method: 'POST',
        body: formData,
        headers: {
          'X-File-Name': file.name,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      }

      const data = await response.json();
      setResult({
        success: true,
        data,
        fileName: file.name,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      setError(err.message || 'Failed to upload document');
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles?.[0]) {
      const event = { target: { files: droppedFiles } };
      handleFileChange(event);
    }
  };

  return (
    <div className="ingestion-tester">
      <div className="ingestion-container">
        <div className="ingestion-header">
          <h1>Document Ingestion Pipeline Tester</h1>
          <p className="subtitle">Upload a PDF to test the ingestion and extraction pipeline</p>
          <Link to="/" className="back-link">← Back to Dashboard</Link>
        </div>

        <div className="ingestion-content">
          <div className="upload-section">
            <div
              className="drop-zone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="drop-zone-content">
                <svg className="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                <p className="drop-text">Drag and drop a PDF file here</p>
                <p className="drop-subtext">or click to select a file</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="file-input"
              />
            </div>

            {file && (
              <div className="file-info">
                <p className="file-name">
                  <strong>Selected:</strong> {file.name}
                </p>
                <p className="file-size">
                  <strong>Size:</strong> {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}

            <div className="actions">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary"
              >
                Choose File
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="btn btn-primary"
              >
                {loading ? 'Uploading...' : 'Extract Document'}
              </button>
            </div>
          </div>

          {error && (
            <div className="result error">
              <div className="result-header error">
                <span className="result-icon">✕</span>
                <span className="result-title">Error</span>
              </div>
              <p className="error-message">{error}</p>
            </div>
          )}

          {result && (
            <div className="result success">
              <div className="result-header success">
                <span className="result-icon">✓</span>
                <span className="result-title">Extraction Successful</span>
              </div>
              <div className="result-details">
                <p>
                  <strong>File:</strong> {result.fileName}
                </p>
                <p>
                  <strong>Extracted at:</strong> {result.timestamp}
                </p>
                <p>
                  <strong>Status:</strong>{' '}
                  <span className="status-badge success">Completed</span>
                </p>
              </div>

              <div className="result-content">
                <h3>Extraction Results</h3>
                <pre className="code-block">{JSON.stringify(result.data, null, 2)}</pre>
              </div>

              <div className="result-actions">
                <button
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setError(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  className="btn btn-secondary"
                >
                  Upload Another
                </button>
                <button
                  onClick={() => {
                    const dataStr = JSON.stringify(result.data, null, 2);
                    const element = document.createElement('a');
                    element.setAttribute(
                      'href',
                      'data:text/plain;charset=utf-8,' + encodeURIComponent(dataStr)
                    );
                    element.setAttribute('download', `extraction-${Date.now()}.json`);
                    element.style.display = 'none';
                    document.body.appendChild(element);
                    element.click();
                    document.body.removeChild(element);
                  }}
                  className="btn btn-secondary"
                >
                  Download JSON
                </button>
              </div>
            </div>
          )}

          <div className="api-info">
            <h3>API Information</h3>
            <div className="info-box">
              <p>
                <strong>Endpoint:</strong>{' '}
                <code>POST http://localhost:7071/api/extractDocument</code>
              </p>
              <p>
                <strong>Input:</strong> Multipart form data with 'file' field (PDF)
              </p>
              <p>
                <strong>Output:</strong> JSON with extracted text, fields, and metadata
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentIngestionTester;
