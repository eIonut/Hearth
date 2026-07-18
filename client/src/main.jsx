import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.jsx';
import { ConfirmProvider } from './components/common/ConfirmDialog.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ConfirmProvider>
      <App />
    </ConfirmProvider>
  </BrowserRouter>,
);
