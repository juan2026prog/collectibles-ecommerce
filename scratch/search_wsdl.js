const fs = require('fs');
const path = require('path');

const wsdlPath = path.join(__dirname, '..', 'GAgencia.wsdl');

try {
  let content = fs.readFileSync(wsdlPath, 'utf8');
  if (content.includes('\u0000')) {
    content = fs.readFileSync(wsdlPath, 'utf16le');
  }

  // Let's find all complex types containing wsInGuia
  const regex = /<s:element name="(wsInGuia[^"]+)">([\s\S]*?)<\/s:element>/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];
    console.log(`\nFound operation element: ${name}`);
    
    // Find all element names inside sequence
    const elemRegex = /name="([^"]+)"/g;
    let elemMatch;
    const params = [];
    while ((elemMatch = elemRegex.exec(body)) !== null) {
      params.push(elemMatch[1]);
    }
    console.log('Parameters:', params.join(', '));
  }
} catch (err) {
  console.error('Error reading WSDL:', err.message);
}
