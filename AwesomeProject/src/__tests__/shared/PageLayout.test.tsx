import fs from 'fs';
import path from 'path';

test('PageLayout no longer wraps content in PageTransitionWrapper', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../shared/components/PageLayout.tsx'),
    'utf8',
  );
  expect(source).not.toMatch(/PageTransitionWrapper/);
});
