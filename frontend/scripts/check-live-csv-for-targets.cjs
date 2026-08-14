const fs = require('fs');

async function checkLiveCsv() {
  console.log('Fetching live https://collectibles.uy/meta-catalog.csv ...');
  const res = await fetch('https://collectibles.uy/meta-catalog.csv');
  const text = await res.text();

  const lines = text.split('\n');
  console.log('Total CSV lines:', lines.length);

  const targets = [
    { name: 'Blanka', id: '5d7a7570-8749-4ecd-ab44-f5c28872f56a' },
    { name: 'Ken', id: 'acfac5ce-4360-4f8a-982e-9db411b11c9a' },
    { name: 'Amy', id: 'b9fed99b-020d-4e0f-9aff-ec123921a957' },
    { name: 'Guile', id: 'c3e7daaa-73a8-459b-9ade-25a75aac881a' },
    { name: 'Honda', id: '99b81b61-4c00-4ba7-88f8-6b3a792cd355' }
  ];

  targets.forEach(t => {
    const line = lines.find(l => l.includes(t.id));
    if (line) {
      console.log(`\n=== ${t.name} (${t.id}) ===`);
      console.log(line);
    } else {
      console.log(`\n=== ${t.name} (${t.id}) === NOT FOUND IN LIVE CSV!`);
    }
  });
}

checkLiveCsv();
