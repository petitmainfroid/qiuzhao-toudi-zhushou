import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogicalFieldInventory, publicInventoryEvidence } from '../modules/real-page-validation/index.mjs';

function control(ref, label, role, extras = {}) {
  return {
    ref, role, tag: role === 'button' ? 'custom' : role === 'textbox' ? 'input' : 'custom',
    semantics: { label }, required: false, safety: 'ordinary', hasValue: false, ...extras
  };
}

test('logical inventory collapses option and identity composites and excludes add actions', () => {
  const candidate = createLogicalFieldInventory({
    pageEpoch: 7,
    state: {
      origin: 'https://xiaomi.jobs.f.mioffice.cn', path: '/internship/resume/:id/apply',
      controls: [
        control('node_radio_001', '无', 'radio', { hasValue: true, required: true }),
        control('node_radio_002', '内推', 'radio', { required: true }),
        control('node_radio_003', '大使推荐', 'radio', { required: true }),
        control('node_idtype_01', '个人证件', 'combobox', { safety: 'identity', required: true }),
        control('node_idvalue_1', '个人证件', 'textbox', { safety: 'identity', required: true }),
        control('node_school_01', '学校名称', 'textbox', { semantics: { label: '学校名称', name: 'education_list' }, hasValue: true }),
        control('node_addedu_01', '添加教育经历', 'button', { semantics: { label: '添加教育经历', name: 'education_list.add' } }),
        control('node_submit_01', '提交简历', 'button', { safety: 'final-submit', tag: 'button' })
      ]
    }
  });
  assert.equal(candidate.rawControlCount, 8);
  assert.equal(candidate.fields.length, 4);
  assert.equal(candidate.fields[0].privateReview.label, '投递渠道');
  assert.equal(candidate.fields[0].privateReview.pageState, 'filled');
  assert.equal(candidate.fields[1].safetyClass, 'sensitive-confirmation');
  assert.deepEqual(candidate.fields[2].repeatable, { groupRef: 'education_list', instanceIndex: 0 });
  assert.equal(candidate.fields[3].safetyClass, 'final-submit');
  assert.equal(candidate.excludedActions.length, 1);
  const publicEvidence = publicInventoryEvidence(candidate);
  assert.equal(JSON.stringify(publicEvidence).includes('学校名称'), false);
  assert.match(publicEvidence.fieldStructureHash, /^[a-f0-9]{64}$/);
});

test('repeatable instance indexes are stable per group and semantic field', () => {
  const candidate = createLogicalFieldInventory({
    pageEpoch: 2,
    state: {
      origin: 'https://xiaomi.jobs.f.mioffice.cn', path: '/internship/resume/:id/apply',
      controls: [
        control('node_school_01', '学校名称', 'textbox', { semantics: { label: '学校名称', name: 'education_list' } }),
        control('node_degree_01', '学历', 'combobox', { semantics: { label: '学历', name: 'education_list' } }),
        control('node_school_02', '学校名称', 'textbox', { semantics: { label: '学校名称', name: 'education_list' } }),
        control('node_degree_02', '学历', 'combobox', { semantics: { label: '学历', name: 'education_list' } })
      ]
    }
  });
  assert.deepEqual(candidate.fields.map((field) => field.repeatable?.instanceIndex), [0, 0, 1, 1]);
  assert.equal(new Set(candidate.fields.map((field) => field.fieldInstanceId)).size, 4);
});
