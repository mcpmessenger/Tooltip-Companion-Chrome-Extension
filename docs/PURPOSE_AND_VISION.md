# Tooltip Companion: Purpose & Vision

## Core Purpose

**Tooltip Companion is a general tech support and browsing assistant that is page-aware and can provide instructions about how to accomplish workflows on any given website.**

## Key Value Propositions

### 1. **Workflow Guidance**
- Understand what users are trying to accomplish
- Provide step-by-step instructions for complex workflows
- Guide through multi-step processes (e.g., opening accounts, applying, purchasing)

### 2. **Page Awareness**
- Know what page the user is viewing
- Understand page structure from tooltip previews
- Context-aware assistance based on actual page content

### 3. **Content Understanding**
- Extract and understand page content via OCR
- Analyze page types and purposes
- Identify available actions and workflows

### 4. **Proactive Assistance**
- Anticipate user needs based on page content
- Suggest relevant workflows
- Provide context-aware help

## Current Capabilities

### ✅ What We Have
- **Page Preview System**: Tooltips show screenshots and metadata
- **OCR Text Extraction**: Can read page content
- **Page Type Detection**: Identifies banking, ecommerce, login, etc.
- **Context Tracking**: Stores tooltip history
- **Chat Interface**: Basic Q&A capability

### ❌ What's Missing for Workflow Assistant
- **Workflow Detection**: Don't identify multi-step processes
- **Step-by-Step Instructions**: No structured workflow guidance
- **Action Sequencing**: Don't understand "next steps" in workflows
- **Workflow Templates**: No knowledge of common workflows (account opening, checkout, etc.)
- **Contextual Guidance**: Not optimized for "how do I..." questions

## Proposed Enhancements

### 1. **Workflow Detection & Analysis**
- Detect workflows from OCR text (e.g., "Step 1", "Next", "Complete", "Apply")
- Identify workflow stages (start, middle, completion)
- Understand workflow dependencies

### 2. **Workflow Instruction Engine**
- Generate step-by-step instructions from page content
- Provide actionable guidance (click here, fill this, etc.)
- Handle multi-page workflows

### 3. **Enhanced Chat Intelligence**
- Special handling for "how do I" questions
- Workflow-specific responses
- Context-aware next-step suggestions

### 4. **Workflow Memory**
- Track user progress through workflows
- Remember where user is in multi-step processes
- Provide continuation guidance

## Example Use Cases

### Banking Workflow
**User**: "How do I open a checking account?"
**Assistant**: Based on tooltip preview showing account opening page:
1. "Click 'Open online' or 'Get started' button"
2. "Fill in your personal information"
3. "Make a qualifying direct deposit of $1,000 or more within 90 days"
4. "You'll receive a $325 bonus when requirements are met"

### E-commerce Workflow
**User**: "How do I checkout?"
**Assistant**: Based on tooltip preview showing cart/checkout:
1. "Review items in your cart"
2. "Click 'Proceed to checkout'"
3. "Enter shipping information"
4. "Select payment method"
5. "Review and confirm order"

## Success Metrics

- **Workflow Completion Rate**: % of users who complete workflows with guidance
- **Instruction Clarity**: Can users follow the steps?
- **Context Accuracy**: Do instructions match actual page content?
- **User Satisfaction**: Do users find it helpful for navigating websites?

