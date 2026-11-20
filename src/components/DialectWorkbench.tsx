import './DialectWorkbench.css';
import React from 'react';
import WorkbenchHeader from './WorkbenchHeader';
import DialectNavigator from './DialectNavigator';
import WorkspaceTabs from './WorkspaceTabs';
import WorkbenchInspector from './WorkbenchInspector';
import WorkbenchStatusBar from './WorkbenchStatusBar';

/**
 * DialectWorkbench – top‑level shell that defines the grid layout.
 * It does **not** contain any business logic; child components manage their own state.
 */
const DialectWorkbench: React.FC = () => {
  return (
    <div className="dialect-workbench">
      <WorkbenchHeader />
      <DialectNavigator />
      <WorkspaceTabs />
      <WorkbenchInspector />
      <WorkbenchStatusBar />
    </div>
  );
};

export default DialectWorkbench;
