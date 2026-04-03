
const functionUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co/functions/v1/create-payment';
try {
  const res = await fetch(functionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'dlocal',
      amount: 100.0,
      currency: 'UYU',
      order_id: 'DIAGNOSTIC-' + Date.now(),
      customer: { name: 'Diag User', email: 'diag@example.com' }
    })
  });
  const text = await res.text();
  console.log('--- DIAGNOSTIC RESULT ---');
  console.log(text);
  console.log('-------------------------');
} catch (e) {
  console.error('Fetch Error:', e.message);
}

