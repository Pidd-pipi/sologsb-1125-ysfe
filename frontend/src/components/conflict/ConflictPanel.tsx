import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { RecordConflict } from '../../types/conflict';
import { useSampleStore } from '../../stores/sampleStore';
import { formatScalar } from '../../utils/merge';
import { formatDate } from '../../utils/format';

interface ConflictPanelProps {
  /** 与当前记录相关的未处理冲突 */
  conflicts: RecordConflict[];
  /** 字段值格式化（枚举字段转中文），缺省用通用格式化 */
  formatValue?: (field: string, value: unknown) => string;
}

/**
 * 未处理冲突面板：逐字段列出双方候选值与修改时间，
 * 编目员选定最终内容后写入记录并清除该字段冲突。
 * 选定后总览 / 筛选 / 切片 / 地点统计都读同一份（已写入 store 的）数据。
 */
export default function ConflictPanel({ conflicts, formatValue }: ConflictPanelProps) {
  const resolveConflictField = useSampleStore((s) => s.resolveConflictField);
  const [choosingKey, setChoosingKey] = useState<string | null>(null);

  if (conflicts.length === 0) return null;

  const fmt = formatValue ?? ((_field, value) => formatScalar(value));
  const totalFields = conflicts.reduce((n, c) => n + c.fields.length, 0);

  const choose = async (conflictId: string, field: string, value: unknown) => {
    setChoosingKey(`${conflictId}:${field}`);
    try {
      await resolveConflictField(conflictId, field, value);
    } finally {
      setChoosingKey(null);
    }
  };

  return (
    <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ alignItems: 'flex-start' }}>
      <Stack spacing={1.5} sx={{ width: '100%' }}>
        <Typography variant="subtitle2" fontWeight={700}>
          检测到 {conflicts.length} 条记录、{totalFields} 个字段在你打开期间被另一方改过，双方的值与修改时间都已保留。请选定最终内容：
        </Typography>

        {conflicts.map((c) => (
          <Box key={c.id}>
            <Chip
              size="small"
              variant="outlined"
              label={`${c.table === 'samples' ? '样本' : '发现地'}：${c.recordLabel}`}
              sx={{ mb: 1 }}
            />
            {c.fields.map((f) => {
              const busy = choosingKey === `${c.id}:${f.field}`;
              return (
                <Box
                  key={f.field}
                  sx={{
                    border: '1px solid',
                    borderColor: 'warning.light',
                    borderRadius: 1.5,
                    bgcolor: 'background.paper',
                    p: 1.25,
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {f.label} 字段冲突
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {f.candidates.map((cand, i) => (
                      <Box
                        key={i}
                        sx={{
                          flex: '1 1 240px',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1.5,
                          p: 1.25,
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          <Chip
                            size="small"
                            label={cand.source ?? `候选 ${i + 1}`}
                            color={i === 0 ? 'primary' : 'default'}
                          />
                          <Typography variant="caption" color="text.secondary">
                            修改于 {formatDate(cand.updatedAt)}
                          </Typography>
                        </Stack>
                        <Typography variant="body1" fontWeight={600} sx={{ mt: 0.75, wordBreak: 'break-all' }}>
                          {fmt(f.field, cand.value)}
                        </Typography>
                        <Button
                          size="small"
                          variant={i === 0 ? 'contained' : 'outlined'}
                          color={i === 0 ? 'primary' : 'secondary'}
                          startIcon={<CheckCircleIcon />}
                          disabled={busy}
                          onClick={() => void choose(c.id, f.field, cand.value)}
                          sx={{ mt: 1 }}
                        >
                          选此为最终值
                        </Button>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Box>
        ))}
      </Stack>
    </Alert>
  );
}
