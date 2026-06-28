# State Management and Data Refresh

## State-Preserving Global Refresh

ScholarDocX employs a global data refresh system that fetches the latest data for the active tab without destroying the user's local UI state (such as scroll positions, active modals, or uncommitted form data).

### The `refreshTrigger` Pattern

**DO NOT use React `key` prop manipulation to force a component remount for data refresh.**
Previously, components were remounted by incrementing a `key` prop (e.g., `projectWorkspaceHomeKey`). This is strictly prohibited as it destroys the DOM tree and ruins the user experience.

Instead, we use a `refreshTrigger` integer passed down from `App.tsx`:

1. **`App.tsx` State**:
   ```tsx
   const [refreshTrigger, setRefreshTrigger] = useState(0);
   ```
2. **Prop Drilling**:
   The `refreshTrigger` is passed to top-level tab views (e.g., `<ProjectWorkspace refreshTrigger={refreshTrigger} />`).

3. **Background Fetching**:
   Top-level components must listen to `refreshTrigger` changes via `useEffect` and trigger their specific data load functions.
   ```tsx
   export function MyComponent({ refreshTrigger }: { refreshTrigger?: number }) {
     useEffect(() => {
       if (refreshTrigger && refreshTrigger > 0) {
         fetchMyData(); // Silently pull new data
       }
     }, [refreshTrigger]);
   }
   ```

### When Creating New Pages/Tabs
If you create a new top-level tab in `App.tsx`, you **must**:
1. Accept the `refreshTrigger?: number` prop in the new component.
2. Implement the `useEffect` block to reload the data.
3. Include a unit test that verifies the data refresh logic works when `refreshTrigger` is incremented. (See `CODE_RULES.md`).

### Centralized Fetching (Alternative)
For very simple tabs (like Dashboard or Documents), data is sometimes fetched centrally within the `refreshActiveTab` switch statement in `App.tsx` and passed down as direct props. This also achieves state-preservation because React reconciles the new props without unmounting the component. However, for complex views with their own context and fetch logic, the `refreshTrigger` pattern is the standard.
