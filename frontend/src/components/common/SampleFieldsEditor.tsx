import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useLocalDraft } from '../../hooks/useLocalDraft';
import { useSampleStore } from '../../stores/sampleStore';
import { useToastStore } from '../../stores/uiStore';
import { fieldLabel } from '../../types/conflict';
import {
  CHEMICAL_GROUP_LABELS,
  CHEMICAL_GROUPS,
  FALL_OR_FIND_LABELS,
  FALL_OR_FINDS,
  SAMPLE_CATEGORIES,
  STORAGE_LABELS,
  STORAGE_LOCATIONS,
  WEATHERING_GRADES,
  WEATHERING_LABELS,
  type MeteoriteSample,
} from '../../types/sample';

type FormValues = {
  sampleNo: string;
  totalWeight: number;
  category: MeteoriteSample['category'];
  chemicalGroup: MeteoriteSample['chemicalGroup'];
  weathering: MeteoriteSample['weathering'];
  fallOrFind: MeteoriteSample['fallOrFind'];
  storage: MeteoriteSample['storage'];
  note: string;
};

function toForm(sample: MeteoriteSample): FormValues {
  return {
    sampleNo: sample.sampleNo,
    totalWeight: sample.totalWeight,
    category: sample.category,
    chemicalGroup: sample.chemicalGroup,
    weathering: sample.weathering,
    fallOrFind: sample.fallOrFind,
    storage: sample.storage,
    note: sample.note ?? '',
  };
}

const CATEGORY_TEXT: Record<MeteoriteSample['category'], string> = {
  chondrite: '球粒陨石',
  iron: '铁陨石',
  'stony-iron': '石铁陨石',
  achondrite: '无球粒陨石',
};

interface SampleFieldsEditorProps {
  sample: MeteoriteSample;
  /** 这些字段存在未裁决冲突，不允许直接覆盖，需要先去冲突面板选定 */
  conflictedFields: Set<string>;
}

/**
 * 详情页样本字段编辑：提交时携带打开时的基准版本与基准值，
 * 走字段级三路合并；与检测页 / 其他标签页同时保存时，
 * 同一字段分歧会被保留为冲突而非互相覆盖。
 */
export function SampleFieldsEditor({ sample, conflictedFields }: SampleFieldsEditorProps) {
  const commitSampleFields = useSampleStore((s) => s.commitSampleFields);
  const notify = useToastStore((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const initial = useMemo(() => toForm(sample), [sample.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useLocalDraft<FormValues>(`sample-edit:${sample.id}`, initial);
  const baseRef = useRef<{ revision: number; base: Record<string, unknown> }>({
    revision: sample.revision,
    base: { ...initial },
  });

  // 从失败草稿恢复时直接展开表单；同时以打开编辑时的版本作为合并基准
  useEffect(() => {
    if (draft.failed) setOpen(true);
  }, [draft.failed]);

  const startEdit = () => {
    // 每次重新展开都以库中最新内容作为基准快照
    baseRef.current = { revision: sample.revision, base: { ...toForm(sample) } };
    draft.setValue(toForm(sample));
    setOpen(true);
  };

  const blocked = Array.from(conflictedFields).map((f) => f);

  const submit = async () => {
    const list: string[] = [];
    if (!draft.value.sampleNo.trim()) list.push('样本编号不能为空');
    if (!(Number(draft.value.totalWeight) > 0)) list.push('总重量需大于 0 g');
    if (list.length) {
      draft.markFailed(list.join('；'));
      return;
    }
    setSaving(true);
    try {
      const next = { ...draft.value, note: draft.value.note.trim(), sampleNo: draft.value.sampleNo.trim() };
      const { conflictCount } = await commitSampleFields({
        id: sample.id,
        baseRevision: baseRef.current.revision,
        base: baseRef.current.base,
        next: next as unknown as Record<string, unknown>,
        fields: [
          'sampleNo',
          'totalWeight',
          'category',
          'chemicalGroup',
          'weathering',
          'fallOrFind',
          'storage',
          'note',
        ],
        source: 'detail',
      });
      const scrollY = draft.succeed();
      setOpen(false);
      if (conflictCount > 0) {
        notify(`保存完成，但有 ${conflictCount} 个字段与另一处保存冲突，请在下方冲突面板裁决`, 'warning');
      } else {
        notify('样本信息已按字段合并保存');
      }
      if (typeof scrollY === 'number') window.scrollTo({ top: scrollY });
    } catch (err) {
      draft.markFailed(err instanceof Error ? err.message : '本地库写入异常');
      notify('保存失败，草稿已保留，可从上次位置重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  const v = draft.value;

  return (
    <Box>
      <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={startEdit}>
        编辑基本信息
      </Button>
      <Collapse in={open}>
        <Box sx={{ mt: 1.5, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Stack spacing={1.5}>
            {draft.failed ? (
              <Alert
                severity="error"
                action={
                  <Button color="inherit" size="small" onClick={() => void submit()} disabled={saving}>
                    从上次位置重试
                  </Button>
                }
              >
                上次保存失败：{draft.error}。草稿与滚动位置已保留。
              </Alert>
            ) : null}
            {blocked.length ? (
              <Alert severity="warning">
                字段（{blocked.map((f) => fieldLabel('sample', f)).join('、')}
                ）存在未裁决冲突，请先在冲突面板选定最终内容后再编辑。
              </Alert>
            ) : null}

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField
                size="small"
                label="样本编号"
                value={v.sampleNo}
                onChange={(e) => draft.patch({ sampleNo: e.target.value })}
                sx={{ width: 170 }}
              />
              <TextField
                size="small"
                type="number"
                label="总重量 g"
                value={v.totalWeight}
                onChange={(e) => draft.patch({ totalWeight: Number(e.target.value) })}
                sx={{ width: 130 }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>分类</InputLabel>
                <Select
                  label="分类"
                  value={v.category}
                  onChange={(e) => draft.patch({ category: e.target.value as FormValues['category'] })}
                >
                  {SAMPLE_CATEGORIES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {CATEGORY_TEXT[c]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>化学群</InputLabel>
                <Select
                  label="化学群"
                  value={v.chemicalGroup}
                  onChange={(e) =>
                    draft.patch({ chemicalGroup: e.target.value as FormValues['chemicalGroup'] })
                  }
                >
                  {CHEMICAL_GROUPS.map((g) => (
                    <MenuItem key={g} value={g}>
                      {CHEMICAL_GROUP_LABELS[g]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>风化等级</InputLabel>
                <Select
                  label="风化等级"
                  value={v.weathering}
                  onChange={(e) =>
                    draft.patch({ weathering: e.target.value as FormValues['weathering'] })
                  }
                >
                  {WEATHERING_GRADES.map((w) => (
                    <MenuItem key={w} value={w}>
                      {WEATHERING_LABELS[w]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>发现/坠落</InputLabel>
                <Select
                  label="发现/坠落"
                  value={v.fallOrFind}
                  onChange={(e) =>
                    draft.patch({ fallOrFind: e.target.value as FormValues['fallOrFind'] })
                  }
                >
                  {FALL_OR_FINDS.map((f) => (
                    <MenuItem key={f} value={f}>
                      {FALL_OR_FIND_LABELS[f]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel>存放位置</InputLabel>
                <Select
                  label="存放位置"
                  value={v.storage}
                  onChange={(e) => draft.patch({ storage: e.target.value as FormValues['storage'] })}
                >
                  {STORAGE_LOCATIONS.map((s) => (
                    <MenuItem key={s} value={s}>
                      {STORAGE_LABELS[s]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <TextField
              size="small"
              label="备注"
              value={v.note}
              onChange={(e) => draft.patch({ note: e.target.value })}
              multiline
              minRows={2}
            />
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="contained"
                size="small"
                startIcon={<SaveIcon />}
                onClick={() => void submit()}
                disabled={saving}
              >
                {saving ? '合并保存中…' : '合并保存'}
              </Button>
              <Button
                variant="text"
                size="small"
                startIcon={<RestartAltIcon />}
                onClick={() => {
                  draft.setValue(toForm(sample));
                  draft.clearFailure();
                }}
              >
                还原为库中内容
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                基准版本 r{baseRef.current.revision}；与其他页面同时保存时按字段合并
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default SampleFieldsEditor;
