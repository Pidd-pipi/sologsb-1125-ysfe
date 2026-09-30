import { useRef, useState } from 'react';
import {
  Button,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import type { MeteoriteSample } from '../../types/sample';
import {
  CHEMICAL_GROUPS,
  CHEMICAL_GROUP_LABELS,
  FALL_OR_FINDS,
  FALL_OR_FIND_LABELS,
  SAMPLE_CATEGORIES,
  STORAGE_LABELS,
  STORAGE_LOCATIONS,
  WEATHERING_GRADES,
  WEATHERING_LABELS,
  type ChemicalGroup,
  type FallOrFind,
  type SampleCategory,
  type StorageLocation,
  type WeatheringGrade,
} from '../../types/sample';
import { useSampleStore, type MergeOutcome } from '../../stores/sampleStore';
import { diffFields, sampleEditableFields } from '../../utils/merge';

interface Props {
  sample: MeteoriteSample;
  onSaved: (outcome: MergeOutcome) => void;
  onCancel: () => void;
}

/** 样本基本信息就地编辑：保存时以「打开时快照」为基线做三向字段合并 */
export default function SampleEditForm({ sample, onSaved, onCancel }: Props) {
  const updateSample = useSampleStore((s) => s.updateSample);
  const baseRef = useRef<Record<string, unknown>>(sampleEditableFields(sample));
  const [form, setForm] = useState<Record<string, unknown>>(() => sampleEditableFields(sample));
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const diff = diffFields(baseRef.current, form);
      if (Object.keys(diff).length === 0) {
        onCancel();
        return;
      }
      const outcome = await updateSample(
        sample.id,
        diff as Partial<MeteoriteSample>,
        baseRef.current as Partial<MeteoriteSample>,
      );
      onSaved(outcome);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ mt: 1 }}>
      <Grid container spacing={1.5}>
        <Grid item xs={6} sm={4}>
          <TextField
            size="small"
            label="样本编号"
            value={String(form.sampleNo ?? '')}
            onChange={(e) => set('sampleNo', e.target.value)}
            fullWidth
          />
        </Grid>
        <Grid item xs={6} sm={4}>
          <TextField
            size="small"
            type="number"
            label="总重量 g"
            value={Number(form.totalWeight) || 0}
            onChange={(e) => set('totalWeight', Number(e.target.value))}
            fullWidth
          />
        </Grid>
        <Grid item xs={6} sm={4}>
          <FormControl size="small" fullWidth>
            <InputLabel>分类</InputLabel>
            <Select
              label="分类"
              value={form.category as SampleCategory}
              onChange={(e) => set('category', e.target.value as SampleCategory)}
            >
              {SAMPLE_CATEGORIES.map((c) => (
                <MenuItem key={c} value={c}>
                  {c === 'chondrite'
                    ? '球粒陨石'
                    : c === 'iron'
                      ? '铁陨石'
                      : c === 'stony-iron'
                        ? '石铁陨石'
                        : '无球粒陨石'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6} sm={4}>
          <FormControl size="small" fullWidth>
            <InputLabel>化学群</InputLabel>
            <Select
              label="化学群"
              value={form.chemicalGroup as ChemicalGroup}
              onChange={(e) => set('chemicalGroup', e.target.value as ChemicalGroup)}
            >
              {CHEMICAL_GROUPS.map((g) => (
                <MenuItem key={g} value={g}>
                  {CHEMICAL_GROUP_LABELS[g]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6} sm={4}>
          <FormControl size="small" fullWidth>
            <InputLabel>风化等级</InputLabel>
            <Select
              label="风化等级"
              value={form.weathering as WeatheringGrade}
              onChange={(e) => set('weathering', e.target.value as WeatheringGrade)}
            >
              {WEATHERING_GRADES.map((w) => (
                <MenuItem key={w} value={w}>
                  {WEATHERING_LABELS[w]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6} sm={4}>
          <FormControl size="small" fullWidth>
            <InputLabel>发现 / 坠落</InputLabel>
            <Select
              label="发现 / 坠落"
              value={form.fallOrFind as FallOrFind}
              onChange={(e) => set('fallOrFind', e.target.value as FallOrFind)}
            >
              {FALL_OR_FINDS.map((f) => (
                <MenuItem key={f} value={f}>
                  {FALL_OR_FIND_LABELS[f]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6} sm={4}>
          <FormControl size="small" fullWidth>
            <InputLabel>存放位置</InputLabel>
            <Select
              label="存放位置"
              value={form.storage as StorageLocation}
              onChange={(e) => set('storage', e.target.value as StorageLocation)}
            >
              {STORAGE_LOCATIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {STORAGE_LABELS[s]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <TextField
            size="small"
            label="备注"
            value={String(form.note ?? '')}
            onChange={(e) => set('note', e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
        </Grid>
      </Grid>
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={() => void save()}
          disabled={saving}
        >
          保存修改
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          取消
        </Button>
      </Stack>
    </Stack>
  );
}
