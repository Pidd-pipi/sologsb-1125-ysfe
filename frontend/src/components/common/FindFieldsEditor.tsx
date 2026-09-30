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
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CoordinatePicker from './CoordinatePicker';
import { useLocalDraft } from '../../hooks/useLocalDraft';
import { useSampleStore } from '../../stores/sampleStore';
import { useToastStore } from '../../stores/uiStore';
import type { FindRecord } from '../../types/find';
import {
  COORDINATE_SOURCE_LABELS,
  COORDINATE_SOURCES,
  FIND_ENVIRONMENT_LABELS,
  FIND_ENVIRONMENTS,
  isValidLatitude,
  isValidLongitude,
  type CoordinateSource,
  type FindEnvironment,
} from '../../types/find';
import { validateCoordinate } from '../../utils/geo';
import { fieldLabel } from '../../types/conflict';

export type FindFormValues = {
  placeName: string;
  region: string;
  longitude: number;
  latitude: number;
  coordinateSource: CoordinateSource;
  environment: FindEnvironment;
  finder: string;
};

function toForm(find: FindRecord): FindFormValues {
  return {
    placeName: find.placeName,
    region: find.region,
    longitude: find.longitude,
    latitude: find.latitude,
    coordinateSource: find.coordinateSource,
    environment: find.environment,
    finder: find.finder,
  };
}

const EMPTY: FindFormValues = {
  placeName: '',
  region: '',
  longitude: 16.2,
  latitude: 27.4,
  coordinateSource: 'gps',
  environment: 'desert',
  finder: '',
};

const FIELDS = [
  'placeName',
  'region',
  'longitude',
  'latitude',
  'coordinateSource',
  'environment',
  'finder',
] as const;

interface FindFieldsEditorProps {
  sampleId: string;
  find?: FindRecord;
  conflictedFields: Set<string>;
}

/** 详情页发现地编辑 / 补录：同样携带基准版本走字段级合并 */
export function FindFieldsEditor({ sampleId, find, conflictedFields }: FindFieldsEditorProps) {
  const commitFindFields = useSampleStore((s) => s.commitFindFields);
  const addFind = useSampleStore((s) => s.addFind);
  const notify = useToastStore((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const initial = useMemo(() => (find ? toForm(find) : EMPTY), [find?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useLocalDraft<FindFormValues>(
    find ? `find-edit:${find.id}` : `find-add:${sampleId}`,
    initial,
  );
  const baseRef = useRef<{ revision: number; base: Record<string, unknown> }>(
    find ? { revision: find.revision, base: { ...toForm(find) } } : { revision: 0, base: {} },
  );

  useEffect(() => {
    if (draft.failed) setOpen(true);
  }, [draft.failed]);

  const startEdit = () => {
    if (find) baseRef.current = { revision: find.revision, base: { ...toForm(find) } };
    draft.setValue(find ? toForm(find) : EMPTY);
    setOpen(true);
  };

  const coordError = validateCoordinate(draft.value.longitude, draft.value.latitude);
  const blocked = Array.from(conflictedFields);

  const submit = async () => {
    const list: string[] = [];
    if (!draft.value.placeName.trim()) list.push('发现地名不能为空');
    if (!draft.value.region.trim()) list.push('国家 / 地区不能为空');
    if (coordError) list.push(coordError);
    if (!isValidLongitude(draft.value.longitude) || !isValidLatitude(draft.value.latitude)) {
      list.push('经纬度超出合法范围');
    }
    if (list.length) {
      draft.markFailed(list.join('；'));
      return;
    }
    setSaving(true);
    try {
      const next: FindFormValues = {
        ...draft.value,
        placeName: draft.value.placeName.trim(),
        region: draft.value.region.trim(),
        finder: draft.value.finder.trim() || '未署名',
      };
      if (find) {
        const { conflictCount } = await commitFindFields({
          id: find.id,
          baseRevision: baseRef.current.revision,
          base: baseRef.current.base,
          next: next as unknown as Record<string, unknown>,
          fields: FIELDS,
          source: 'detail',
        });
        draft.succeed();
        setOpen(false);
        if (conflictCount > 0) {
          notify(`发现地已保存，但有 ${conflictCount} 个字段冲突，请在冲突面板裁决`, 'warning');
        } else {
          notify('发现地已按字段合并保存');
        }
      } else {
        await addFind({ sampleId, ...next });
        draft.succeed();
        setOpen(false);
        notify('发现地已补录');
      }
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
      <Button
        size="small"
        variant="outlined"
        startIcon={find ? <EditIcon /> : <AddLocationAltIcon />}
        onClick={startEdit}
      >
        {find ? '编辑发现地' : '补录发现地'}
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
                字段（{blocked.map((f) => fieldLabel('find', f)).join('、')}
                ）存在未裁决冲突，请先在冲突面板选定最终内容。
              </Alert>
            ) : null}

            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField
                size="small"
                label="发现地名"
                value={v.placeName}
                onChange={(e) => draft.patch({ placeName: e.target.value })}
                sx={{ width: 200 }}
              />
              <TextField
                size="small"
                label="国家 / 地区"
                value={v.region}
                onChange={(e) => draft.patch({ region: e.target.value })}
                sx={{ width: 180 }}
              />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>坐标来源</InputLabel>
                <Select
                  label="坐标来源"
                  value={v.coordinateSource}
                  onChange={(e) =>
                    draft.patch({ coordinateSource: e.target.value as CoordinateSource })
                  }
                >
                  {COORDINATE_SOURCES.map((c) => (
                    <MenuItem key={c} value={c}>
                      {COORDINATE_SOURCE_LABELS[c]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>发现环境</InputLabel>
                <Select
                  label="发现环境"
                  value={v.environment}
                  onChange={(e) => draft.patch({ environment: e.target.value as FindEnvironment })}
                >
                  {FIND_ENVIRONMENTS.map((c) => (
                    <MenuItem key={c} value={c}>
                      {FIND_ENVIRONMENT_LABELS[c]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="发现者"
                value={v.finder}
                onChange={(e) => draft.patch({ finder: e.target.value })}
                sx={{ width: 170 }}
              />
            </Stack>
            <CoordinatePicker
              longitude={v.longitude}
              latitude={v.latitude}
              onChange={(longitude, latitude) => draft.patch({ longitude, latitude })}
            />
            {coordError ? null : (
              <Typography variant="caption" color="success.main">
                经纬度范围校验通过
              </Typography>
            )}
            <Stack direction="row" spacing={1.5}>
              <Button
                variant="contained"
                size="small"
                startIcon={<SaveIcon />}
                onClick={() => void submit()}
                disabled={saving}
              >
                {saving ? '保存中…' : find ? '合并保存发现地' : '保存发现地'}
              </Button>
              <Button
                variant="text"
                size="small"
                startIcon={<RestartAltIcon />}
                onClick={() => {
                  draft.setValue(find ? toForm(find) : EMPTY);
                  draft.clearFailure();
                }}
              >
                还原
              </Button>
              {find ? (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  基准版本 r{baseRef.current.revision}
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

export default FindFieldsEditor;
