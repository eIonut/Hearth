import { useParams } from 'react-router';
import SubTabsNav from '../components/common/SubTabsNav.jsx';
import Snippets from './Snippets.jsx';
import SkillsPage from './SkillsPage.jsx';

const TABS = [
  { to: '/library/snippets', label: 'Snippets' },
  { to: '/library/skills', label: 'AI skills' },
];

export default function Library() {
  const { tab } = useParams();
  return (
    <div className="page">
      <div className="row space-between">
        <h2>Library</h2>
        <SubTabsNav tabs={TABS} />
      </div>
      {tab === 'snippets' && <Snippets />}
      {tab === 'skills' && <SkillsPage />}
    </div>
  );
}
