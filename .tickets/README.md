# Ticket-Driven Development Workflow

Every new feature, bug fix, or significant change must be managed through a structured "ticket" folder within this `.tickets` directory. This ensures a perfect paper trail of why and how decisions were made.

## Folder Structure

For every new task, create a new subfolder using a consistent naming convention:
`TKT-[ID]-[feature-name]` (e.g., `TKT-001-feature-name`).

## Ticket Folder Contents

Every ticket folder MUST contain the following markdown files:

1. **`01-discussion.md`**: A detailed record of the initial feature request, brainstorming, user stories, and acceptance criteria.
2. **`02-implementation_plan.md`**: A strict, step-by-step technical plan for how the feature will be built. This outlines exact files to be changed, database schema updates, and API modifications.
3. **`03-execution_log.md`**: A running log of what was actually changed during coding, any roadblocks encountered, and how they were resolved.
4. **`04-testing_and_verification.md`**: Clear instructions on how to test the feature (manual steps and automated scripts) along with the final success/failure results.

## Mandatory Workflow

### Phase 1 (Planning)
When assigning a new task, the agent's very first action is to create the ticket folder and fill out `01-discussion.md` and `02-implementation_plan.md`. 
**Stop and wait for explicit approval** on the implementation plan before writing any actual project code.

### Phase 2 (Execution)
Once the plan is approved, write the code. Document the progress and specific file changes in `03-execution_log.md`.

### Phase 3 (Verification)
After coding, test the feature to ensure it meets the acceptance criteria. Document the findings in `04-testing_and_verification.md`.

Use the `_TEMPLATE` folder to copy boilerplate versions of the required documents for new tickets.
