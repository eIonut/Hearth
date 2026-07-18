import { useState } from 'react';
import SubTabs from '../components/SubTabs.jsx';
import Snippets from './Snippets.jsx';
import SkillsPage from './SkillsPage.jsx';

const TABS = [
  { id: 'snippets', label: 'Snippets' },
  { id: 'skills', label: 'AI skills' },
];

export default function Library() {
  const [tab, setTab] = useState('snippets');
  return (
    <div className="page">
      <div className="row space-between">
        <h2>Library</h2>
        <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      {tab === 'snippets' && <Snippets />}
      {tab === 'skills' && <SkillsPage />}
    </div>
  );
}
