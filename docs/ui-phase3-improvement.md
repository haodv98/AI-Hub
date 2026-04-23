This is a complex, high-level UI/UX migration task. To ensure the AI handles this accurately, I have structured the prompt into a **Technical Implementation Roadmap**. It uses professional software engineering terminology (Cyber-security/Operator theme) as requested in your description.

---

### **Professional AI Prompt: UI/UX Migration & Feature Implementation**

**Role:** Senior Frontend Engineer & UI/UX Specialist
**Task:** Systematic UI/UX Migration and Feature Implementation from `ai-hub-ui` to the current `/web` front-end.

**Core Execution Principles:**
1.  **1:1 Design Fidelity:** Maintain exact visual parity with the `ai-hub-ui` source.
2.  **Modular Architecture:** Extract reusable components, constants, and utility functions into the `/web/common` or `/web/components` directories.
3.  **Data Handling:** If current hooks lack specific data fields, implement **Lorem Ipsum/Placeholder** data. Ensure the UI is "API-ready" for future mapping.
4.  **Thematic Consistency:** Use the "Operator/Tactical" nomenclature provided (e.g., Transmission, Protocols, Tactical Units).

---

### **Implementation Modules:**

#### **1. Identity & Security Management (Keys & Session)**
*   **Keys Screen:** Implement the following dialogs:
    *   *Internal Token Issuance:* Interface for generating and copying new keys.
    *   *Protocol Rotation:* A confirmation dialog for "Rotate Key" operations.
    *   *Token Termination:* A high-visibility dialog for revoking access.
*   **Session Termination (Logout):** 
    *   Implement an **Error-themed modal** triggered by "Terminate Session" in the Sidebar.
    *   Display security warnings regarding the disconnection between the workstation and the AIHub Core.
    *   Actions: "Terminate Link" (Confirm) and "Acknowledge & Cancel" (Dismiss).

#### **2. Governance & Policy Engine (Policy Screen)**
*   **Simulation Matrix Tab:** Develop a visual impact analysis tool for policies.
*   **Hierarchy Layering Panel:** Create a multi-tier view showing policy effects across User, Role, Team, and Org levels.
*   **Policy Configuration:** Refine the UI and add a "Network Integrity" section (IP Authorization Allowlist).
*   **Policy Interaction Logic:**
    *   *Zero-Confirmation Detachment:* Implement a "Detach" button (trash icon) in the "Bound Protocols" list. Upon clicking, remove the policy immediately without a confirmation dialog.
    *   *Real-time UI Recalculation:* Automatically update the "Effective Policy" state upon any detachment.
    *   *Policy Linking (Jump to Manifest):* Add a navigation button (ArrowRightLeft icon) on policy cards. 
    *   *Deep Linking:* Clicking this button must switch to the Policies tab, activate the specific Policy Editor, and auto-scroll to the relevant configuration section.

#### **3. Organizational Structure (Teams & Members)**
*   **Teams Module:**
    *   *Tactical Unit Initialization:* Dialog for creating new teams.
    *   *Core Strategy Recruitment:* A multi-select modal for managing team members (supporting many-to-many relationships).
    *   *Team Detail (Audit):* A comprehensive view for team-specific logs and activity.
*   **Members Module:**
    *   *Onboarding Dialog:* Manual member addition.
    *   *CSV Import:* Bulk ingestion of personnel data.
    *   *Member Detail (Audit):* Detailed profile and activity history.

#### **4. System Feedback & Interaction Design**
*   **Transmission Logs (Toast System):** Build a global notification system for system alerts and status updates.
*   **Active Deploy Button (Stateful Interaction):**
    *   Label: "Deploy Protocol Changes".
    *   Processing State: Change label to "Deploying Transmission...", animate the "Activity" icon (spin), and **disable interaction** to prevent duplicate requests.
*   **UX Enhancements:**
    *   *Command Palette (Global Search):* Triggered by `Cmd/Ctrl + K` or TopBar search. Features: Backdrop blur, support for searching Subjects (Members), Units (Teams), and Protocols (Policies).
    *   *Visual Hierarchy:* Use `group-hover` logic to display "Detach" buttons only when hovering over items to maintain a clean interface.
    *   *Operator Tooltips:* Ensure every action button has a descriptive `title` attribute (e.g., "Jump to Policy Manifest").

---

### **Deliverables:**
*   TypeScript/React components following Atomic Design.
*   Clean separation of UI logic and Mock Data.
*   A directory structure that mirrors the current `/web` architecture.
