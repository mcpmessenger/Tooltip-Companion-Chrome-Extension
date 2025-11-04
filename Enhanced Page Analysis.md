## Detailed Implementation Plan: Enhanced Page Analysis

This plan details the steps, required technologies, and estimated effort to implement the **Enhanced Page Analysis** recommendation for the Tooltip Companion Chrome Extension. The goal is to move beyond simple keyword matching to provide the AI with deeper semantic and visual context of the web page.

### Required Technologies

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend** | Node.js / Express | Host the enhanced analysis logic. |
| **Browser Automation** | Playwright | Capture full-page screenshots and extract key HTML metadata. |
| **AI Model** | OpenAI API (GPT-4 / GPT-4V) | Perform semantic analysis on text and visual analysis on screenshots. |
| **Extension** | JavaScript (Content/Background) | Trigger the new analysis endpoint and pass the results to the chat prompt. |

### Implementation Phases and Estimated Effort

The implementation is broken down into three main phases, with an estimated effort in person-days (PD).

#### Phase 1: Semantic Analysis Enrichment (Estimated Effort: 3 PD)

This phase focuses on using the existing extracted page text to generate a more intelligent, structured analysis using a large language model (LLM).

| Step | Description | Location | Effort (PD) |
| :--- | :--- | :--- | :--- |
| **1.1 Update `analyze_page` Input** | Modify the existing `analyze_page` function in `playwright_service/server.js` to accept the full page text content (in addition to the URL). | `playwright_service/server.js` | 0.5 |
| **1.2 Create LLM Analysis Prompt** | Develop a structured system prompt for the LLM (e.g., GPT-4) that instructs it to generate a JSON object from the page text, including: **Summary of Page's Purpose**, **Key Call-to-Action (CTA) Elements**, and **Sentiment**. | `playwright_service/server.js` | 1.0 |
| **1.3 Implement LLM Call** | Integrate the LLM call within `analyze_page` to process the page text and return the structured JSON analysis. Implement robust error handling and fallback to the existing keyword-based analysis if the LLM call fails. | `playwright_service/server.js` | 1.0 |
| **1.4 Update Caching** | Ensure the new, richer analysis object is correctly stored and retrieved from the `pageAnalysisCache`. | `playwright_service/server.js` | 0.5 |

#### Phase 2: Key HTML Metadata Extraction (Estimated Effort: 2 PD)

This phase ensures that critical, high-signal HTML elements are extracted and included in the context, providing the AI with a quick, reliable overview of the page's intent.

| Step | Description | Location | Effort (PD) |
| :--- | :--- | :--- | :--- |
| **2.1 Playwright Metadata Extraction** | Modify the screenshot capture logic to also extract key HTML elements: `<title>`, `<meta name="description">`, and all visible `<h1>` tags. | `playwright_service/server.js` | 1.0 |
| **2.2 Update Analysis Structure** | Integrate the extracted HTML metadata into the `analyze_page` return object (e.g., under a new `htmlMetadata` key). | `playwright_service/server.js` | 0.5 |
| **2.3 Extension Context Update** | Ensure the extension's background script correctly receives and formats this new metadata when preparing the context for the chat prompt. | `background.js` / `content.js` | 0.5 |

#### Phase 3: Visual Context Integration (Estimated Effort: 5 PD)

This phase introduces the most significant enhancement: using a multi-modal model to analyze the full-page screenshot, providing "Visual Understanding."

| Step | Description | Location | Effort (PD) |
| :--- | :--- | :--- | :--- |
| **3.1 Full-Page Screenshot Capture** | Modify the Playwright logic to capture a full-page screenshot (not just the viewport) when the `analyze_page` tool is called. | `playwright_service/server.js` | 1.0 |
| **3.2 Image Encoding and Preparation** | Encode the full-page screenshot as a Base64 string for transmission to the Vision Model API (e.g., GPT-4V). | `playwright_service/server.js` | 0.5 |
| **3.3 Vision Model Prompting** | Develop a prompt for the Vision Model to generate a structured, textual description of the page's visual layout, key images, and overall design. Instruct the model to output a JSON object (e.g., `visualSummary: { layout: '...', keyElements: ['...'] }`). | `playwright_service/server.js` | 2.0 |
| **3.4 Integrate Visual Summary** | Add the structured visual summary to the `analyze_page` return object. | `playwright_service/server.js` | 0.5 |
| **3.5 Prompt Engineering Update** | Update the final chat prompt (from Recommendation 2.1) to include the new `visualSummary` as part of the AI's context. | `playwright_service/server.js` | 1.0 |

### Summary of Estimated Effort

| Phase | Description | Estimated Effort (PD) |
| :--- | :--- | :--- |
| **Phase 1** | Semantic Analysis Enrichment | 3.0 PD |
| **Phase 2** | Key HTML Metadata Extraction | 2.0 PD |
| **Phase 3** | Visual Context Integration | 5.0 PD |
| **Total Estimated Effort** | | **10.0 Person-Days** |

### Dependencies and Risks

| Dependency | Description | Mitigation Strategy |
| :--- | :--- | :--- |
| **OpenAI API Access** | Requires access to advanced models (GPT-4 for semantic, GPT-4V for visual). | Ensure API keys are configured and have sufficient quota for the required models. |
| **Backend Stability** | The new features (especially full-page screenshot and LLM calls) are resource-intensive. | Prioritize the "Backend Stabilization" plan (from the initial Project Assessment) before or concurrently with this plan. Monitor CPU/Memory usage closely during testing. |
| **Cost Management** | Using GPT-4/GPT-4V is significantly more expensive than simple API calls. | Implement strict rate limiting and caching for the `analyze_page` endpoint. Only trigger the full visual analysis when the user explicitly opens the chat panel. |

This plan provides a clear, actionable path to dramatically increase the intelligence and helpfulness of the Tooltip Companion's context-aware chat feature.
