import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useSampleStore } from '../../stores/sampleStore';
import { useToastStore } from '../../stores/uiStore';
import {
  CONFLICT_ENTITY_LABELS,
  CONFLICT_SOURCE_LABELS,
  fieldLabel,
  formatConflictValue,
  type FieldConflict,
} from '../../types/conflict';
import { formatDateTime } from '../../utils/format';

interface ConflictPanelProps {
  conflicts: FieldConflict[];
  sampleNo: string;
}

/**
 * 字段冲突裁决面板（详情页）。
 * 每个字段展示双方（或多方）保存值、来源页面与修改时间；
 * 编目员选出最终内容后，总览 / 筛选 / 切片 / 地点统计读同一份值。
 * 未处理的冲突记录持久化在 IndexedDB，关掉页面再打开仍在这里。
 */
export function ConflictPanel({ conflicts, sampleNo }: ConflictPanelProps) {
  const resolveConflict = useSampleStore((s) => s.resolveConflict);
  const notify = useToastStore((s) => s.notify);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});

  if (conflicts.length === 0) return null;

  const choose = async (conflict: FieldConflict) => {
    const idx = picks[conflict.id];
    if (idx === undefined) {
      notify('请先点选一个候选值作为最终内容', 'warning');
      return;
    }
    const chosen = conflict.candidates[idx];
    setBusyId(conflict.id);
    try {
      await resolveConflict(conflict.id, chosen.value);
      notify(
        `${sampleNo} 的「${fieldLabel(conflict.entityType, conflict.field)}」已按 ${formatDateTime(chosen.updatedAt)} 的保存值定稿`,
      );
    } catch (err) {
      notify(`定稿失败：${err instanceof Error ? err.message : '本地库写入异常'}`, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderColor: 'warning.main',
        borderWidth: 2,
        bgcolor: 'rgba(237,108,2,0.05)',
      }}
      data-testid="conflict-panel"
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <Typography variant="h6" color="warning.dark">
            并发保存冲突（{conflicts.length} 个字段待裁决）
          </Typography>
          <Chip size="small" color="warning" label="双方值与修改时间均已保留" />
        </Stack>
        <Alert severity="warning">
          两个页面同时编辑了同一块陨石。未裁决字段暂时按修改时间最晚的值显示并用于筛选统计；
          请逐字段核对并选出最终内容。冲突保存在本地库中，关闭页面后重新打开仍可继续处理。
        </Alert>

        {conflicts.map((c) => (
          <Box
            key={c.id}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2, bgcolor: 'background.paper' }}
            data-testid={`conflict-${c.entityType}-${c.field}`}
          >
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" variant="outlined" label={CONFLICT_ENTITY_LABELS[c.entityType]} />
                <Typography variant="subtitle1" fontWeight={700}>
                  {fieldLabel(c.entityType, c.field)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  共同基准值：{formatConflictValue(c.entityType, c.field, c.baseValue)}
                </Typography>
              </Stack>

              <Stack spacing={1}>
                {c.candidates.map((cand, idx) => {
                  const selected = picks[c.id] === idx;
                  const isActive = cand.value === c.activeValue;
                  return (
                    <Box
                      key={`${cand.source}-${cand.updatedAt}-${idx}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPicks((p) => ({ ...p, [c.id]: idx }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPicks((p) => ({ ...p, [c.id]: idx }));
                        }
                      }}
                      sx={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                        flexWrap: 'wrap',
                        p: 1.25,
                        borderRadius: 1.5,
                        border: '2px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        bgcolor: selected ? 'rgba(75,63,47,0.07)' : 'transparent',
                      }}
                    >
                      <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
                        <Box
                          sx={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: '2px solid',
                            borderColor: selected ? 'primary.main' : 'text.disabled',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {selected ? (
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />
                          ) : null}
                        </Box>
                        <Typography variant="body1" fontWeight={selected ? 700 : 400}>
                          {formatConflictValue(c.entityType, c.field, cand.value)}
                        </Typography>
                        {isActive ? (
                          <Chip size="small" color="success" variant="outlined" label="当前暂按此值生效" />
                        ) : null}
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip size="small" label={CONFLICT_SOURCE_LABELS[cand.source]} variant="outlined" />
                        <Typography variant="caption" color="text.secondary">
                          修改于 {formatDateTime(cand.updatedAt)}
                        </Typography>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>

              <Divider />
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<CheckCircleIcon />}
                  disabled={busyId === c.id || picks[c.id] === undefined}
                  onClick={() => void choose(c)}
                >
                  {busyId === c.id ? '定稿中…' : '选定为最终内容'}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  定稿后该值成为全站唯一内容，并记入该字段修改时间。
                </Typography>
              </Stack>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

export default ConflictPanel;
