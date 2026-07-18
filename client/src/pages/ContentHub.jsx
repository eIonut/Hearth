import { useParams } from 'react-router';
import SubTabsNav from '../components/common/SubTabsNav.jsx';
import Learning from './Learning.jsx';
import ContentPage from './ContentPage.jsx';
import DigestPage from './DigestPage.jsx';

const TABS = [
  { to: '/content/learning', label: 'Learning queue' },
  { to: '/content/pipeline', label: 'Ideas & drafts' },
  { to: '/content/digest', label: 'Digest' },
];

export default function ContentHub() {
  const { tab } = useParams();
  return (
    <div className="max-w-[1100px] p-6">
      <div className="my-1.5 flex flex-wrap items-center justify-between gap-2">
        <h2>Content</h2>
        <SubTabsNav tabs={TABS} />
      </div>
      {tab === 'learning' && <Learning />}
      {tab === 'pipeline' && <ContentPage />}
      {tab === 'digest' && <DigestPage />}
    </div>
  );
}
