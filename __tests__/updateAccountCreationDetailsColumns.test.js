const fs = require('fs');
const path = require('path');

describe('updateAccountCreationDetails column safety regression', () => {
  it('writes only to ACCOUNTS E/F columns in active implementation', () => {
    const scriptPath = path.join(__dirname, '..', 'clasp', 'Резиденты Мабиз.js');
    const content = fs.readFileSync(scriptPath, 'utf8');

    const marker = 'function updateAccountCreationDetails() {';
    const firstIdx = content.indexOf(marker);
    expect(firstIdx).toBeGreaterThanOrEqual(0);

    const lastIdx = content.lastIndexOf(marker);
    expect(lastIdx).toBeGreaterThanOrEqual(0);

    const nextFunctionIdx = content.indexOf('\nfunction ', lastIdx + marker.length);
    const body = nextFunctionIdx === -1
      ? content.slice(lastIdx)
      : content.slice(lastIdx, nextFunctionIdx);

    expect(body).toContain('const createdByCol = 5;');
    expect(body).toContain('const createdAtCol = 6;');
    expect(body).toContain('const accountCol = 1;');
    expect(body).toContain('const labelCol = 2;');

    expect(body).not.toContain("headers.indexOf('created_by')");
    expect(body).not.toContain("headers.indexOf('created_at')");
  });
});

