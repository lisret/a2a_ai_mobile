import fs from 'fs';
import path from 'path';

describe('HomeScreen companion prompt', () => {
  it('uses the custom sheet for missing companion model', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../features/task/screens/HomeScreen.tsx',
      ),
      'utf8',
    );
    expect(source).toMatch(/showCustomAlert\(\s*'请先配置陪伴模型'/);
    expect(source).not.toMatch(/Alert\.alert\(\s*'请先配置陪伴模型'/);
  });
});
