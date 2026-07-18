import { useState } from 'react';
import SubTabs from '../components/common/SubTabs.jsx';
import Learning from './Learning.jsx';
import ContentPage from './ContentPage.jsx';
import DigestPage from './DigestPage.jsx';

const TABS = [
  { id: 'learning', label: 'Learning queue' },
  { id: 'pipeline', label: 'Ideas & drafts' },
  { id: 'digest', label: 'Digest' },
];

export default function ContentHub() {
  const [tab, setTab] = useState('learning');
  return (
    <div className="page">
      <div className="row space-between">
        <h2>Content</h2>
        <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      {tab === 'learning' && <Learning />}
      {tab === 'pipeline' && <ContentPage />}
      {tab === 'digest' && <DigestPage />}
    </div>
  );
}
