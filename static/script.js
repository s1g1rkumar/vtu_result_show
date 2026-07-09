document.addEventListener("DOMContentLoaded", () => {
  // --- Configuration ---
  const API_URL = "http://127.0.0.1:5000/api/vtu/results";
  // const API_URL = "https://vtu-result-scraper.vercel.app/api/vtu/results";

  // --- DOM Elements ---
  const usnInput = document.getElementById("usn-input");
  const subjectCodeInput = document.getElementById("subject-code-input");
  
  const indexUrlInput = document.getElementById("index-url-input");
  const resultUrlInput = document.getElementById("result-url-input");
  
  const fetchButton = document.getElementById("fetch-button");
  const buttonText = document.getElementById("button-text"); 
  const loadingSpinner = document.getElementById("loading-spinner");
  
  const statusMessage = document.getElementById("status-message");
  const summaryOutput = document.getElementById("summary-output");
  const failedOutput = document.getElementById("failed-output");

  // Generator Elements
  const usnPrefix = document.getElementById("usn-prefix");
  const usnStart = document.getElementById("usn-start");
  const usnEnd = document.getElementById("usn-end");
  const generateButton = document.getElementById("generate-button");

  // --- Utility Functions ---

  /**
   * Generates a list of USNs based on a prefix and a numeric range,
   * ensuring a fixed three-digit suffix (e.g., 001, 015).
   */
  function generateUSNs(prefix, start, end) {
    const generatedList = [];
    const FIXED_PADDING_LENGTH = 3; 

    for (let i = start; i <= end; i++) {
      const paddedNumber = String(i).padStart(FIXED_PADDING_LENGTH, "0");
      generatedList.push(`${prefix.toUpperCase()}${paddedNumber}`);
    }
    return generatedList;
  }

  /**
   * Cleans and normalizes the USN input into a list of unique, uppercase strings.
   */
  function cleanUSNInput(rawText) {
    // Allows newlines, commas, and semi-colons as separators
    const normalizedText = rawText.replace(/[\n,;]+/g, "|").replace(/\s+/g, "");

    return normalizedText
      .split("|")
      .map((usn) => usn.trim().toUpperCase())
      .filter((usn, index, self) => usn && self.indexOf(usn) === index);
  }

  /**
   * Updates the status message box with new content and styling.
   */
  function updateStatus(message, type = "initial", isHtml = false) {
    statusMessage.className = `message-box ${type}`;
    if (isHtml) {
      statusMessage.innerHTML = message;
    } else {
      statusMessage.textContent = message;
    }
  }

  /**
   * Hides all dynamic output sections.
   */
  function hideOutputs() {
    summaryOutput.classList.add("hidden");
    failedOutput.classList.add("hidden");
    summaryOutput.innerHTML = "";
    failedOutput.innerHTML = "";
  }

  /**
   * Toggles the loading state for the button.
   */
  function setLoading(isLoading) {
    fetchButton.disabled = isLoading;
    if (isLoading) {
      loadingSpinner.style.display = "inline-block";
      // Update button text and icon during loading
      buttonText.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Processing Results...';
    } else {
      loadingSpinner.style.display = "none";
      // Restore original button text and icon
      buttonText.innerHTML = '<i class="fas fa-file-download"></i> Fetch & Generate Excel';
    }
  }

  // --- Event Listeners ---

  // 1. USN Generation Listener
  generateButton.addEventListener("click", () => {
    const prefix = usnPrefix.value.trim();
    const start = parseInt(usnStart.value, 10);
    const end = parseInt(usnEnd.value, 10);

    // Validation checks
    if (!prefix || prefix.length < 5) {
      alert("Please enter a valid USN prefix (e.g., 1BI23EC).");
      usnPrefix.focus();
      return;
    }
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      alert(
        "Please enter valid starting and ending numbers (Start must be <= End, and both must be >= 1)."
      );
      return;
    }
    if (end > 999) {
        alert("The maximum ending number for the standard 3-digit USN format is 999. Please adjust the range.");
        usnEnd.focus();
        return;
    }

    if (end - start > 100) {
      if (
        !confirm(
          "Warning: Generating over 100 USNs. This might take a long time and put stress on the scraper. Continue?"
        )
      ) {
        return;
      }
    }

    const generatedList = generateUSNs(prefix, start, end);
    const newContent = generatedList.join(", ");

    const currentContent = usnInput.value.trim();
    if (currentContent) {
      usnInput.value = currentContent + ", " + newContent;
    } else {
      usnInput.value = newContent;
    }

    updateStatus(
      `✅ Generated **${generatedList.length} USNs** with 3-digit padding and appended them to the input box.`,
      "success",
      true
    );
  });

  // 2. Main Fetch Handler
  fetchButton.addEventListener("click", async () => {
    const result = cleanUSNInput(usnInput.value);
    const subjectCode = subjectCodeInput.value.trim().toUpperCase();
    
    const indexUrl = indexUrlInput.value.trim();
    const resultUrl = resultUrlInput.value.trim();

    hideOutputs();

    if (result.length === 0) {
      updateStatus("Please enter at least one valid USN to start scraping.", "failure");
      return;
    }
    
    // URL Validation
    if (!indexUrl.startsWith('http') || !resultUrl.startsWith('http')) {
        updateStatus("⚠️ URL Error: Please ensure both Index and Result URLs are valid (must start with http/https).", "failure");
        return;
    }

    setLoading(true);
    updateStatus(
      `⏳ Starting scrape for **${result.length} USNs**... This may take a moment due to CAPTCHA solving.`,
      "initial",
      true 
    );

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          usns: result,
          subject_code: subjectCode,
          index_url: indexUrl,
          result_url: resultUrl,
        }),
      });

      if (!response.ok) {
        let errorMsg = `HTTP Error! Status: ${response.status}.`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
        } catch (e) {
            // response body wasn't JSON
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();

      // --- Success/Partial Success Handling ---

      if (data.total_successful > 0) {
        let statusMsg = `✅ **COMPLETED!** Processed ${data.results.length} USNs. Successful: **${data.total_successful}**`;

        if (data.total_failed > 0) {
          statusMsg += `, Failed: **${data.total_failed}**.`;
        }
        
        if (data.download_url && !data.download_url.includes("Error")) {
          // Add a better button/link for download
          statusMsg += ` <br><br>💾 **Download Link:** Your consolidated Excel file is ready. <br><a href="${data.download_url}" target="_blank" class="download-link"><i class="fas fa-file-excel"></i> Download Results File</a>`;
          updateStatus(statusMsg, "success", true);
        } else {
          statusMsg +=
            " The system retrieved results but encountered an issue generating the Excel file.";
          updateStatus(statusMsg, "initial", true);
        }

        // Display Summary
        summaryOutput.innerHTML = `
                    <p><strong>Total USNs Requested:</strong> ${data.results.length}</p>
                    <p><strong>Successfully Retrieved:</strong> <span style="color:var(--secondary-color); font-weight:700;">${data.total_successful}</span></p>
                    <p><strong>Failed/Not Found:</strong> <span style="color:var(--danger-color); font-weight:700;">${data.failed_count}</span></p>
                    <p><strong>Filter Applied:</strong> ${subjectCode || "None"}</p>
                    <p><strong>VTU URL Used:</strong> <code>${indexUrl}</code></p>
                `;
        summaryOutput.classList.remove("hidden");
      } else {
        // --- Complete Failure Handling ---
        updateStatus(
          `❌ **FAILURE!** Could not retrieve results for any of the ${data.results.length} USNs. Reasons may include invalid USN range, incorrect URLs, or persistent CAPTCHA errors.`,
          "failure"
        );
      }

      // Display Failed USNs (if any)
      if (data.failed_usns && data.failed_usns.length > 0) {
        const failedListHtml = data.failed_usns
          .map((item) => `<li><strong>${item.usn}</strong> - ${item.error.replace('captcha', 'CAPTCHA')}</li>`)
          .join("");

        failedOutput.innerHTML = `
                    <h3><i class="fas fa-exclamation-triangle"></i> Failed USNs (${data.failed_count})</h3>
                    <ul>${failedListHtml}</ul>
                `;
        failedOutput.classList.remove("hidden");
      }
    } catch (error) {
      console.error("Scraping API Error:", error);
      updateStatus(
        `💥 **Critical Error:** Failed to connect to the backend server. Is the Flask app running at ${API_URL}? Details: ${error.message}`,
        "failure"
      );
      hideOutputs();
    } finally {
      setLoading(false);
    }
  });
});