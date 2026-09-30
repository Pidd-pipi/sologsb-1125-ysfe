import { mergeEntityFromSnapshot, sameValue } from '../frontend/src/utils/merge.ts';

let pass = 0;
let fail = 0;
function assert(name, cond) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}`);
  }
}

function entity(over = {}) {
  return {
    id: 's1',
    revision: 0,
    updatedAt: 1000,
    fieldUpdatedAt: { category: 1000, chemicalGroup: 1000, totalWeight: 1000, storage: 1000 },
    category: 'chondrite',
    chemicalGroup: 'H',
    totalWeight: 100,
    storage: 'cabinet-a',
    ...over,
  };
}

const FIELDS = ['category', 'chemicalGroup', 'totalWeight', 'storage'];

console.log('同值判定');
assert("'' 与 undefined 视为相同", sameValue('', undefined));
assert('数字相等', sameValue(1, 1));
assert('数字不等', !sameValue(1, 2));

console.log('场景1：无并发，直接快进');
{
  const e = entity();
  const r = mergeEntityFromSnapshot({
    entity: e,
    baseRevision: 0,
    baseFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    nextFields: { category: 'iron', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    editableFields: FIELDS,
    entityType: 'sample',
    source: 'detail',
    now: 2000,
  });
  assert('无冲突', r.conflicts.length === 0);
  assert('类别已更新', r.patch.category === 'iron');
  assert('只写改动字段', Object.keys(r.patch).length === 1);
  assert('revision +1', r.revision === 1);
  assert('字段时间戳更新', r.fieldUpdatedAt.category === 2000);
}

console.log('场景2：改不同字段，双方修改都保留（字段级合并）');
{
  // 另一方已先存：revision=1，改了 category（字段时间戳随提交变为 1500 > 基准版本 0）
  const e = entity({
    revision: 1,
    category: 'iron',
    fieldUpdatedAt: { category: 1500, chemicalGroup: 1000, totalWeight: 1000, storage: 1000 },
  });
  const r = mergeEntityFromSnapshot({
    entity: e,
    baseRevision: 0,
    baseFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    // 本方只改了 totalWeight；化学群字段时间戳仍为 1000（对方没动它）
    nextFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 200, storage: 'cabinet-a' },
    editableFields: FIELDS,
    entityType: 'sample',
    source: 'analysis',
    now: 2000,
  });
  assert('无冲突', r.conflicts.length === 0);
  assert('本方重量合并落库', r.patch.totalWeight === 200);
  assert('不覆盖对方类别（patch 不含 category）', !('category' in r.patch));
  assert('revision +1', r.revision === 2);
}

console.log('场景3：同一字段双方改成不同值 → 冲突，双方值与时间保留');
{
  const e = entity({
    revision: 1,
    category: 'iron',
    fieldUpdatedAt: { category: 1500, chemicalGroup: 1000, totalWeight: 1000, storage: 1000 },
  });
  const r = mergeEntityFromSnapshot({
    entity: e,
    baseRevision: 0,
    baseFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    nextFields: { category: 'achondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    editableFields: FIELDS,
    entityType: 'sample',
    source: 'analysis',
    now: 2000,
  });
  assert('产生 1 个冲突', r.conflicts.length === 1);
  const c = r.conflicts[0];
  assert('冲突字段是 category', c.field === 'category');
  assert('保留另一方值 iron', c.otherValue === 'iron');
  assert('保留本方值 achondrite', c.value === 'achondrite');
  assert('保留基准值 chondrite', c.baseValue === 'chondrite');
  assert('双方时间都保留', c.otherUpdatedAt === 1500 && c.incomingUpdatedAt === 2000);
  assert('记录来源页面', c.source === 'analysis');
  // 本方更晚 → 暂按本方兜底
  assert('暂按更晚修改时间兜底（achondrite）', r.patch.category === 'achondrite');
}

console.log('场景4：对方时间更晚时兜底取对方值');
{
  const e = entity({
    revision: 1,
    category: 'iron',
    fieldUpdatedAt: { category: 5000, chemicalGroup: 1000, totalWeight: 1000, storage: 1000 },
  });
  const r = mergeEntityFromSnapshot({
    entity: e,
    baseRevision: 0,
    baseFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    nextFields: { category: 'achondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    editableFields: FIELDS,
    entityType: 'sample',
    source: 'detail',
    now: 2000,
  });
  assert('冲突存在', r.conflicts.length === 1);
  assert('暂取对方更晚值 iron', r.patch.category === 'iron');
}

console.log('场景5：双方改成相同值 → 不算冲突');
{
  const e = entity({
    revision: 1,
    category: 'iron',
    fieldUpdatedAt: { category: 1500, chemicalGroup: 1000, totalWeight: 1000, storage: 1000 },
  });
  const r = mergeEntityFromSnapshot({
    entity: e,
    baseRevision: 0,
    baseFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    nextFields: { category: 'iron', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    editableFields: FIELDS,
    entityType: 'sample',
    source: 'detail',
    now: 2000,
  });
  assert('无冲突', r.conflicts.length === 0);
  assert('一致值落库', r.patch.category === 'iron');
}

console.log('场景6：没有任何改动 → noop，revision 不增');
{
  const e = entity();
  const r = mergeEntityFromSnapshot({
    entity: e,
    baseRevision: 0,
    baseFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    nextFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    editableFields: FIELDS,
    entityType: 'sample',
    source: 'detail',
  });
  assert('noop', r.noop === true);
  assert('revision 不变', r.revision === 0);
}

console.log('场景7：一方改字段+另一方改不同字段，同时存在冲突字段（混合）');
{
  const e = entity({
    revision: 1,
    category: 'iron',
    chemicalGroup: 'IAB',
    fieldUpdatedAt: { category: 1500, chemicalGroup: 1500, totalWeight: 1000, storage: 1000 },
  });
  const r = mergeEntityFromSnapshot({
    entity: e,
    baseRevision: 0,
    baseFields: { category: 'chondrite', chemicalGroup: 'H', totalWeight: 100, storage: 'cabinet-a' },
    nextFields: { category: 'achondrite', chemicalGroup: 'H', totalWeight: 200, storage: 'cabinet-a' },
    editableFields: FIELDS,
    entityType: 'sample',
    source: 'detail',
    now: 2000,
  });
  assert('1 个冲突', r.conflicts.length === 1);
  assert('重量无冲突合并', r.patch.totalWeight === 200);
  assert('化学群未被本方覆盖', !('chemicalGroup' in r.patch));
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
if (fail > 0) process.exit(1);
