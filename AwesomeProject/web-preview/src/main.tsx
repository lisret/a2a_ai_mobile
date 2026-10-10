import React from 'react';
import {createRoot} from 'react-dom/client';
import {PreviewShell} from './PreviewShell';
import {seedPreviewHistory} from './fixtures';
import './preview.css';

seedPreviewHistory()
  .then(() => {
    createRoot(document.getElementById('root')!).render(<PreviewShell />);
  })
  .catch(error => {
    document.getElementById('root')!.textContent =
      '预览初始化失败：' + String(error);
    console.error(error);
  });
