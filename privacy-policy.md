# Privacy Policy for Tooltip Companion

**Last Updated:** November 3, 2025  
**Version:** 1.5.0 (Operation Juicebox)

**Website:** [tooltipcompanion.com/privacy](https://tooltipcompanion.com/privacy)

## Introduction

Tooltip Companion ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, process, and safeguard your information when you use our browser extension and visit our website.

## Information We Collect

### Browser Extension

#### 1. **Screenshot Data**
- **What we collect**: When you hover over links, the extension captures screenshots of those pages
- **How it's used**: Screenshots are processed to:
  - Generate tooltip previews
  - Extract text using OCR (Optical Character Recognition)
  - Analyze page content using AI (when Enhanced Page Analysis is enabled)
- **Storage**: Screenshots are cached locally in your browser's IndexedDB storage and temporarily processed on our secure backend servers
- **Retention**: Screenshots are cached for 5 minutes locally. Backend processing data is not permanently stored.

#### 2. **Page Content Analysis**
- **What we collect**: When Enhanced Page Analysis is enabled:
  - Page text content (extracted via OCR)
  - HTML metadata (page title, meta description, heading tags)
  - Visual layout information (from full-page screenshots)
- **How it's used**: 
  - To provide AI-powered page analysis and context-aware assistance
  - To generate semantic summaries (page purpose, sentiment, key topics)
  - To improve tooltip accuracy and relevance
- **Processing**: Content is sent to our secure backend servers (AWS ECS) for AI analysis using OpenAI's GPT-4 and GPT-4o models
- **Retention**: Analysis results are cached locally for 5 minutes. Original content is not stored permanently.

#### 3. **API Keys** (Optional)
- **What we collect**: If you provide your OpenAI API key for AI chat features
- **Storage**: Stored locally in your browser using Chrome's secure storage (`chrome.storage.sync`). We never send your API keys to our servers unless you explicitly enable cloud synchronization via Google OAuth.
- **Security**: API keys are encrypted in transit and stored using Chrome's built-in security mechanisms

#### 4. **Usage Data**
- **What we collect**: Basic usage information (tooltip interactions, feature usage) stored locally
- **Purpose**: To improve extension performance and user experience
- **Transmission**: This data is not transmitted to external servers

#### 5. **No Personal Data**
- The extension does not collect, store, or transmit any personal identifying information about you (name, email, address, etc.)
- We do not track your browsing history or individual page visits
- We do not collect information about other websites you visit

### Website (tooltipcompanion.com)

When you visit our website and use Google OAuth with Supabase:
- **Authentication Information**: Your Google account information (name, email) for authentication purposes
- **API Keys** (optional): If you choose to sync your API keys via Google OAuth, they are stored securely in Supabase and encrypted at rest
- **Usage Analytics**: Basic analytics about website usage (page views, features used) through standard analytics tools

## How We Use Your Information

### Local Processing
- **Screenshot Capture**: Screenshots are processed locally in your browser when possible
- **Caching**: Screenshot data is cached locally for 5 minutes to improve performance
- **No Persistent Storage**: Screenshot data is not permanently stored on our servers

### Backend Processing (AWS ECS)
- **Screenshot Processing**: When you hover over links, screenshots may be sent to our secure backend servers (hosted on AWS ECS) for:
  - OCR text extraction
  - Enhanced Page Analysis (LLM semantic analysis and Vision model analysis)
  - Screenshot optimization
- **Security**: All data transmission uses HTTPS encryption
- **Retention**: Processing data is not permanently stored; cached results expire after 5 minutes
- **Location**: Backend servers are located in AWS us-east-1 region (United States)

### AI Analysis (OpenAI)
- **When Used**: Enhanced Page Analysis features use OpenAI's GPT-4 and GPT-4o models
- **What's Sent**: 
  - Extracted page text (for semantic analysis)
  - Full-page screenshots (for visual analysis)
  - Page URLs (for context)
- **Your API Key**: If you provide your OpenAI API key, it's used directly from your browser. Our backend uses its own API key for Enhanced Page Analysis features.
- **OpenAI's Privacy**: Your data is subject to [OpenAI's Privacy Policy](https://openai.com/policies/privacy-policy) when processed by their services
- **Data Retention**: OpenAI may retain data per their policies. We do not store your analyzed content permanently.

### Cloud Sync (Optional)
- **Google OAuth**: If you enable cloud synchronization via Google OAuth on tooltipcompanion.com:
  - Your API keys are stored securely in Supabase
  - Data is encrypted at rest
  - You can revoke access at any time through your Google account settings
  - You can delete your data through the tooltipcompanion.com dashboard

### No Third-Party Sharing
- We do not sell, trade, or share your information with third parties for marketing purposes
- We do not use your data for advertising
- We do not create user profiles based on your browsing behavior

## Data Security

### Encryption
- **In Transit**: All communications with our servers use HTTPS/TLS encryption
- **At Rest**: API keys stored in Supabase are encrypted at rest
- **Local Storage**: Browser storage uses Chrome's built-in security mechanisms

### Backend Security
- **AWS Infrastructure**: Backend servers run on AWS ECS Fargate with enterprise-grade security
- **Access Controls**: Backend access is restricted and monitored
- **No Persistent Storage**: Processing data is not permanently stored on our servers

### API Key Security
- **Local Storage**: Your API keys are stored locally in your browser
- **Cloud Storage**: If synced, keys are encrypted in Supabase
- **No Logging**: We do not log API keys in our systems

## Third-Party Services

### Required Services
- **AWS (Amazon Web Services)**: Hosts our backend servers for screenshot processing and AI analysis. See [AWS Privacy Policy](https://aws.amazon.com/privacy/)
- **OpenAI**: Provides AI analysis services (GPT-4, GPT-4o) for Enhanced Page Analysis. See [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)

### Optional Services
- **Supabase**: Used for cloud storage (only if you enable sync). See [Supabase Privacy Policy](https://supabase.com/privacy)
- **Google OAuth**: Used for authentication (only if you enable sync). See [Google Privacy Policy](https://policies.google.com/privacy)

## Your Rights

### Access
- You can view your locally stored data in the extension's options page
- You can request information about data processed by our backend (contact support)

### Deletion
- **Local data**: Clear browser storage or uninstall the extension
- **Cloud data**: Delete through tooltipcompanion.com dashboard or contact support
- **Backend data**: Processing data expires automatically after 5 minutes; no permanent storage

### Opt-Out
- You can use the extension without enabling Enhanced Page Analysis
- You can use the extension without providing API keys
- You can disable cloud sync at any time
- You can uninstall the extension at any time

### Data Portability
- You can export your locally stored API keys through the extension's options page
- Contact support for assistance with data export

## Children's Privacy

Tooltip Companion is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us.

## International Users

If you are using Tooltip Companion from outside the United States, please note that:
- Our backend servers are located in the United States (AWS us-east-1)
- Your data may be transferred to and processed in the United States
- By using the extension, you consent to the transfer of your data to the United States

## Changes to This Policy

We may update this Privacy Policy from time to time to reflect changes in our practices or for legal, operational, or regulatory reasons. We will:
- Post the updated policy on this page
- Update the "Last Updated" date
- Notify users of material changes via the extension or website

Your continued use of Tooltip Companion after changes become effective constitutes acceptance of the updated policy.

## Contact Us

If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:

- **Website**: [tooltipcompanion.com](https://tooltipcompanion.com)
- **Email**: support@tooltipcompanion.com
- **Privacy Concerns**: privacy@tooltipcompanion.com

## Consent

By using Tooltip Companion, you consent to:
- The collection and use of information as described in this Privacy Policy
- The processing of screenshots and page content for tooltip generation and AI analysis
- The transmission of data to our backend servers and third-party AI services (OpenAI)
- The use of cookies and local storage as described in this policy

If you do not agree with this Privacy Policy, please do not use Tooltip Companion.

---

**Effective Date**: November 3, 2025  
**Version**: 1.5.0
