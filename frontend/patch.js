const fs = require('fs');
let content = fs.readFileSync('src/pages/admin/AdminProducts.tsx', 'utf8');
const lines = content.split('\n');
const replacement = `                      <td className="px-6 py-4 text-xs font-bold text-gray-500 cursor-pointer hover:bg-white transition-colors rounded" onClick={(e) => { e.stopPropagation(); setInlineEdit({id: p.id, field: 'category_id'}); setInlineValue(primaryCat?.id || ''); }}>
                        {inlineEdit?.id === p.id && inlineEdit.field === 'category_id' ? (
                          <select autoFocus className="bg-white border rounded text-[10px] p-1 font-bold outline-none" value={inlineValue || ''} onChange={e => { setInlineValue(e.target.value); handleInlineUpdate(p.id, 'category_id', e.target.value); }} onBlur={() => setInlineEdit(null)} onClick={e => e.stopPropagation()}>
                            <option value="">— Sin Categoría —</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        ) : (
                          <span className={\`\${primaryCat ? 'text-gray-900' : 'text-gray-300'}\`}>{primaryCat?.name || '—'}</span>
                        )}
                      </td>`;
lines.splice(440, 17, replacement);
fs.writeFileSync('src/pages/admin/AdminProducts.tsx', lines.join('\n'));
