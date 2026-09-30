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
import type { FindRecord, CoordinateSource, FindEnvironment } from '../../types/find';
import {
  COORDINATE_SOURCES,
  COORDINATE_SOURCE_LABELS,
  FIND_ENVIRONMENTS,
  FIND_ENVIRONMENT_LABELS,
} from '../../types/find';
import { useSampleStore, type MergeOutcome } from '../../stores/sampleStore';
import { diffFields, findEditableFields } from '../../utils/merge';

interface Props {
  find: FindRecord;
  onSaved: (outcome: MergeOutcome) => void;
  onCancel: () => void;
}

/** 发现地信息就地编辑：保存时以「打开时快照」为基线做三向字段合并 */
export default function FindEditForm({ find, onSaved, onCancel }: Props) {
  const updateFind = useSampleStore((s) => s.updateFind);
  const baseRef = useRef<Record<string, unknown>>(findEditableFields(find));
  const [form, setForm] = useState<Record<string, unknown>>(() => findEditableFields(find));
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
      const outcome = await updateFind(
        find.id,
        diff as Partial<FindRecord>,
        baseRef.current as Partial<FindRecord>,
      );
      onSaved(outcome);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ mt: 1 }}>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6}>
          <TextField
            size="small"
            label="发现地名"
            value={String(form.placeName ?? '')}
            onChange={(e) => set('placeName', e.target.value)}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            size="small"
            label="国家 / 地区"
            value={String(form.region ?? '')}
            onChange={(e) => set('region', e.target.value)}
            fullWidth
          />
        </Grid>
        <Grid item xs={6}>
          <TextField
            size="small"
            type="number"
            label="经度"
            value={Number(form.longitude) || 0}
            onChange={(e) => set('longitude', Number(e.target.value))}
            fullWidth
          />
        </Grid>
        <Grid item xs={6}>
          <TextField
            size="small"
            type="number"
            label="纬度"
            value={Number(form.latitude) || 0}
            onChange={(e) => set('latitude', Number(e.target.value))}
            fullWidth
          />
        </Grid>
        <Grid item xs={6}>
          <FormControl size="small" fullWidth>
            <InputLabel>坐标来源</InputLabel>
            <Select
              label="坐标来源"
              value={form.coordinateSource as CoordinateSource}
              onChange={(e) => set('coordinateSource', e.target.value as CoordinateSource)}
            >
              {COORDINATE_SOURCES.map((c) => (
                <MenuItem key={c} value={c}>
                  {COORDINATE_SOURCE_LABELS[c]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6}>
          <FormControl size="small" fullWidth>
            <InputLabel>发现环境</InputLabel>
            <Select
              label="发现环境"
              value={form.environment as FindEnvironment}
              onChange={(e) => set('environment', e.target.value as FindEnvironment)}
            >
              {FIND_ENVIRONMENTS.map((f) => (
                <MenuItem key={f} value={f}>
                  {FIND_ENVIRONMENT_LABELS[f]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <TextField
            size="small"
            label="发现者"
            value={String(form.finder ?? '')}
            onChange={(e) => set('finder', e.target.value)}
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
