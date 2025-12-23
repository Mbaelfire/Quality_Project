import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- Types & Constants ---
type ChartType = 'xbar-r' | 'imr' | 'ewma' | 'cusum';
type Phase = 'phase1' | 'phase2';

interface DataPoint {
    id: number;
    value: number; 
    range?: number; 
    originalValue?: number;
    sampleSize?: number; 
    subgroup?: number[]; 
}

const STAT_CONSTANTS: Record<number, { A2: number, D3: number, D4: number, d2: number }> = {
    2: { A2: 1.880, D3: 0, D4: 3.267, d2: 1.128 },
    3: { A2: 1.023, D3: 0, D4: 2.574, d2: 1.693 },
    4: { A2: 0.729, D3: 0, D4: 2.282, d2: 2.059 },
    5: { A2: 0.577, D3: 0, D4: 2.114, d2: 2.326 },
    6: { A2: 0.483, D3: 0, D4: 2.004, d2: 2.534 },
    7: { A2: 0.419, D3: 0.076, D4: 1.924, d2: 2.704 },
    8: { A2: 0.373, D3: 0.136, D4: 1.864, d2: 2.847 },
    9: { A2: 0.337, D3: 0.184, D4: 1.816, d2: 2.970 },
    10: { A2: 0.308, D3: 0.223, D4: 1.777, d2: 3.078 }
};

const calculateMean = (data: number[]) => data.reduce((a, b) => a + b, 0) / (data.length || 1);
const calculateStdDev = (data: number[]) => {
    const mean = calculateMean(data);
    return Math.sqrt(data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (data.length - 1 || 1));
};

const parseLine = (line: string): number[] => {
    const parts = line.trim().split(/[,\t\s]+/);
    return parts.map(p => parseFloat(p)).filter(n => !isNaN(n));
};

const Card = ({ children, className = "", darkMode }: { children?: React.ReactNode, className?: string, darkMode: boolean }) => (
    <div className={`rounded-3xl shadow-xl transition-all duration-300 ${darkMode ? 'bg-gray-800/80 backdrop-blur-md border-gray-700/50 text-white' : 'bg-white/90 border-slate-200 text-slate-800'} border ${className}`}>
        {children}
    </div>
);

const DataGridWorkspace = ({ rawData, setRawData, darkMode, chartType, subgroupSize }: { rawData: string, setRawData: (s: string) => void, darkMode: boolean, chartType: ChartType, subgroupSize: number }) => {
    const parsedData = useMemo(() => {
        const lines = rawData.split('\n').filter(r => r.trim() !== '');
        const allValues = lines.map(line => parseLine(line)).flat();
        const isGrouped = chartType === 'xbar-r' || (['ewma', 'cusum'].includes(chartType) && subgroupSize > 1);

        if (isGrouped) {
            const size = chartType === 'xbar-r' ? Math.max(2, subgroupSize || 5) : (subgroupSize || 1);
            const rows = [];
            for (let i = 0; i < allValues.length; i += size) {
                const chunk = allValues.slice(i, i + size);
                rows.push({ id: rows.length + 1, cols: chunk, note: '' });
            }
            return rows;
        }

        return lines.map((line, i) => {
            const vals = parseLine(line);
            return { id: i + 1, cols: vals, note: '' };
        });
    }, [rawData, chartType, subgroupSize]);

    const maxCols = useMemo(() => {
        const isGrouped = chartType === 'xbar-r' || (['ewma', 'cusum'].includes(chartType) && subgroupSize > 1);
        if (isGrouped) return chartType === 'xbar-r' ? Math.max(2, subgroupSize) : subgroupSize;
        return Math.max(1, ...parsedData.map(r => r.cols.length));
    }, [parsedData, chartType, subgroupSize]);

    return (
        <Card darkMode={darkMode} className="flex flex-col h-full max-h-[80vh] overflow-hidden">
            <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Veri Tablosu</h2>
                    <p className={`text-sm font-bold opacity-70 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                        VERİLERİ AŞAĞIYA YAPIŞTIRIN (Sütun veya Matris)
                    </p>
                </div>
                <div className={`px-4 py-2 rounded-full text-xs font-bold ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-slate-200 text-slate-600'}`}>
                    {parsedData.length} Satır / Alt Grup
                </div>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row p-6 gap-6 overflow-hidden">
                <div className="flex-1 flex flex-col min-h-0">
                    <label className={`text-sm font-bold mb-3 uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Giriş</label>
                    <textarea 
                        className={`flex-1 w-full p-4 rounded-2xl border-2 font-mono text-sm resize-none focus:ring-4 focus:ring-purple-500/20 outline-none transition-all ${darkMode ? 'bg-gray-900/50 border-gray-600 text-white placeholder-gray-600 focus:border-purple-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-purple-500'}`}
                        value={rawData}
                        onChange={(e) => setRawData(e.target.value)}
                        placeholder={`Örnek:\n46.49\n44.58\n46.94...`}
                        spellCheck={false}
                    />
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                    <label className={`text-sm font-bold mb-3 uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>Önizleme</label>
                    <div className={`flex-1 rounded-2xl border-2 overflow-auto scrollbar-thin ${darkMode ? 'bg-gray-900/50 border-gray-600' : 'bg-slate-50 border-slate-200'}`}>
                        <table className="w-full text-left border-collapse">
                            <thead className={`sticky top-0 z-10 backdrop-blur-sm ${darkMode ? 'bg-gray-800/90 text-gray-300' : 'bg-slate-100/90 text-slate-600'}`}>
                                <tr>
                                    <th className="p-3 text-xs font-bold border-b border-r border-gray-500/20 w-24 text-center">Örnek No</th>
                                    {Array.from({length: maxCols}).map((_, i) => (
                                         <th key={i} className="p-3 text-xs font-bold border-b border-r border-gray-500/20 text-center">
                                             {(chartType === 'xbar-r' || (['ewma', 'cusum'].includes(chartType) && maxCols > 1)) ? `n=${i+1}` : 'Değer'}
                                         </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {parsedData.map((row, i) => (
                                    <tr key={i} className={`border-b border-gray-500/10 ${darkMode ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                                        <td className={`p-2 text-center text-xs font-mono border-r border-gray-500/10 text-white font-bold`}>{row.id}</td>
                                        {Array.from({length: maxCols}).map((_, colIdx) => (
                                            <td key={colIdx} className={`p-2 font-mono text-sm font-bold border-r border-gray-500/10 text-center ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                                                {row.cols[colIdx] !== undefined ? row.cols[colIdx] : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Card>
    );
};

const SPCChart = ({ 
    data, 
    ucl, 
    lcl, 
    cl, 
    title, 
    yLabel,
    specLimits,
    secondarySeries = [], 
    secondaryMeta, 
    plotType = 'line', 
    barColor = '#9333ea',
    darkMode
}: { 
    data: { x: number | string, y: number }[], 
    ucl: number | number[], 
    lcl: number | number[], 
    cl: number, 
    title: string,
    yLabel: string,
    specLimits?: { usl?: number, lsl?: number },
    secondarySeries?: { data: { x: number | string, y: number }[], color: string, label: string }[],
    secondaryMeta?: { target?: number, targetLabel?: string },
    plotType?: 'line' | 'bar',
    barColor?: string,
    darkMode: boolean
}) => {
    const width = 800;
    const height = 400;
    const padding = { top: 30, right: secondarySeries.length > 0 ? 60 : 20, bottom: 40, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    if (!data || data.length === 0) return <div className="p-10 text-center">Veri Yok</div>;

    const getLimitVal = (limit: number | number[], index: number) => Array.isArray(limit) ? limit[index] : limit;

    let yValues = [...data.map(d => d.y)];
    if (Array.isArray(ucl)) yValues.push(...ucl); else yValues.push(ucl);
    if (Array.isArray(lcl)) yValues.push(...lcl); else yValues.push(lcl);
    yValues.push(cl);
    if (plotType === 'bar') yValues.push(0);

    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const yRange = (maxY - minY) * 1.15 || 1;
    const yMinPadded = Math.min(0, minY);
    
    const xScale = (index: number) => padding.left + (index / (data.length - 1 || 1)) * plotWidth;
    const yScale = (val: number) => height - padding.bottom - ((val - yMinPadded) / yRange) * plotHeight;

    let y2Values: number[] = [];
    secondarySeries.forEach(s => s.data.forEach(d => y2Values.push(d.y)));
    if (secondaryMeta?.target !== undefined) y2Values.push(secondaryMeta.target);
    
    const minY2 = y2Values.length ? Math.min(...y2Values) : 0;
    const maxY2 = y2Values.length ? Math.max(...y2Values) : 10;
    const y2Range = (maxY2 - minY2) * 1.2 || 1;
    const y2Scale = (val: number) => height - padding.bottom - ((val - minY2) / y2Range) * plotHeight;

    const axisColor = darkMode ? '#4b5563' : '#94a3b8';
    const textColor = darkMode ? '#d1d5db' : '#334155';
    const gridColor = darkMode ? '#374151' : '#e2e8f0';

    const ticks = 5;
    const yGridLines = Array.from({length: ticks + 1}, (_, i) => {
        const val = yMinPadded + (i * yRange / ticks);
        return (
            <g key={`ygrid-${i}`}>
                <line x1={padding.left} y1={yScale(val)} x2={width - padding.right} y2={yScale(val)} stroke={gridColor} strokeWidth="1" opacity="0.3" />
                <text x={padding.left - 10} y={yScale(val)} dy="4" textAnchor="end" fontSize="10" fill={textColor}>{val.toFixed(2)}</text>
            </g>
        );
    });

    const barWidth = (plotWidth / (data.length || 1)) * 0.7;

    return (
        <Card darkMode={darkMode} className="w-full overflow-hidden p-4">
            <div className={`flex flex-col md:flex-row justify-between items-start md:items-center mb-4 pb-4 border-b ${darkMode ? 'border-gray-700' : 'border-slate-200'}`}>
                <h3 className="text-xl font-extrabold">{title}</h3>
                <div className={`px-4 py-2 rounded-lg border flex flex-wrap gap-4 text-xs font-mono font-bold ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                             <span className="w-3 h-3 rounded-sm" style={{backgroundColor: barColor}}></span>
                             <span>{yLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-0.5 border-t border-dashed border-red-500"></span>
                            <span className="text-red-500">H/Limit</span>
                        </div>
                    </div>
                    {secondarySeries.length > 0 && (
                        <div className="flex flex-col gap-1 border-l pl-4 border-gray-500/20">
                            {secondarySeries.map((s, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                     <span className="w-3 h-0.5" style={{backgroundColor: s.color}}></span>
                                     <span>{s.label}</span>
                                </div>
                            ))}
                            {secondaryMeta?.target !== undefined && (
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-0.5 bg-green-500"></span>
                                    <span className="text-green-500">Hedef: {secondaryMeta.target.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="w-full overflow-x-auto">
                <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="w-full h-auto font-sans min-w-[600px]">
                    <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="none" stroke={axisColor} />
                    {yGridLines}

                    {plotType === 'bar' && data.map((d, i) => {
                         const barH = Math.abs(yScale(0) - yScale(d.y));
                         const barY = d.y >= 0 ? yScale(d.y) : yScale(0);
                         return <rect key={i} x={xScale(i) - barWidth/2} y={barY} width={barWidth} height={barH} fill={barColor} opacity="0.7" />;
                    })}

                    {plotType === 'line' && (
                        <path d={data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.y)}`).join(' ')} fill="none" stroke={barColor} strokeWidth="2" />
                    )}

                    {/* Limits */}
                    {Array.isArray(ucl) ? (
                        <path d={ucl.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="6,4" />
                    ) : (
                        <line x1={padding.left} y1={yScale(ucl)} x2={width - padding.right} y2={yScale(ucl)} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,4" />
                    )}
                    {lcl !== 0 && (
                        Array.isArray(lcl) ? (
                            <path d={lcl.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(v)}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="6,4" />
                        ) : (
                            <line x1={padding.left} y1={yScale(lcl)} x2={width - padding.right} y2={yScale(lcl)} stroke="#ef4444" strokeWidth="2" strokeDasharray="6,4" />
                        )
                    )}

                    {/* Secondary axis line */}
                    {secondarySeries.map((s, idx) => (
                        <g key={`sec-${idx}`}>
                            <path d={s.data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${y2Scale(d.y)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2" />
                            {s.data.map((d, i) => <circle key={i} cx={xScale(i)} cy={y2Scale(d.y)} r={3} fill={s.color} />)}
                        </g>
                    ))}
                    
                    {secondaryMeta?.target !== undefined && (
                        <line x1={padding.left} y1={y2Scale(secondaryMeta.target)} x2={width - padding.right} y2={y2Scale(secondaryMeta.target)} stroke="#22c55e" strokeWidth="2" />
                    )}

                    {secondarySeries.length > 0 && (
                        <g>
                             <line x1={width - padding.right} y1={padding.top} x2={width - padding.right} y2={height - padding.bottom} stroke={axisColor} />
                             {Array.from({length: 6}, (_, i) => {
                                 const val = minY2 + (i * (maxY2 - minY2) / 5);
                                 return (
                                     <g key={`y2grid-${i}`}>
                                         <text x={width - padding.right + 10} y={y2Scale(val)} dy="4" fontSize="10" fill={textColor}>{val.toFixed(1)}</text>
                                     </g>
                                 )
                             })}
                        </g>
                    )}
                </svg>
            </div>
        </Card>
    );
};

const StatisticsDashboard = ({ stats, specLimits, darkMode }: any) => {
    const { mean, sigma, ucl, lcl, cl } = stats;
    const { usl, lsl, target } = specLimits;
    const effectiveTarget = target !== '' ? target : (usl !== '' && lsl !== '') ? (usl + lsl) / 2 : null;
    const u = usl === '' ? undefined : usl;
    const l = lsl === '' ? undefined : lsl;

    let cp = null, cpk = null;
    if (sigma > 0) {
        cp = (u !== undefined && l !== undefined) ? (u - l) / (6 * sigma) : null;
        const cpu = (u !== undefined) ? (u - mean) / (3 * sigma) : null;
        const cpl = (l !== undefined) ? (mean - l) / (3 * sigma) : null;
        if (cpu !== null && cpl !== null) cpk = Math.min(cpu, cpl);
        else if (cpu !== null) cpk = cpu;
        else if (cpl !== null) cpk = cpl;
    }

    const StatBox = ({ label, value }: any) => (
        <div className={`p-4 rounded-xl border flex flex-col items-center justify-center ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-slate-200'}`}>
            <div className="text-xs font-bold uppercase opacity-70 mb-1">{label}</div>
            <div className="text-xl font-mono font-black">{value !== null && value !== '' ? (typeof value === 'number' ? value.toFixed(3) : value) : '-'}</div>
        </div>
    );

    return (
        <Card darkMode={darkMode} className="p-6 mt-8">
            <h3 className="text-xl font-bold mb-6">Süreç İstatistikleri</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                    <h4 className="text-sm font-bold opacity-60 text-center">SÜREÇ PARAMETRELERİ</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <StatBox label="ORTALAMA" value={mean} />
                        <StatBox label="SİGMA" value={sigma} />
                    </div>
                </div>
                <div className="space-y-4">
                    <h4 className="text-sm font-bold opacity-60 text-center">SPESİFİKASYONLAR</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <StatBox label="USL" value={usl} />
                        <StatBox label="LSL" value={lsl} />
                    </div>
                </div>
                <div className="space-y-4">
                    <h4 className="text-sm font-bold opacity-60 text-center">KABİLİYET (3σ)</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <StatBox label="Cp" value={cp} />
                        <StatBox label="Cpk" value={cpk} />
                    </div>
                </div>
            </div>
        </Card>
    );
};

const App = () => {
    const [darkMode, setDarkMode] = useState(true);
    const [activeTab, setActiveTab] = useState<'chart' | 'datasheet'>('chart');
    const [chartType, setChartType] = useState<ChartType>('imr');
    const [phase, setPhase] = useState<Phase>('phase1');
    const [rawData, setRawData] = useState<string>("9.45\n7.99\n9.29\n11.66\n12.16\n10.18\n8.04\n11.46\n9.20\n10.34\n9.03\n11.47\n10.51\n9.40\n10.08\n9.37\n10.62\n10.31\n8.52\n10.84\n10.90\n9.33\n12.29\n11.50\n10.60\n11.08\n10.38\n11.62\n11.31\n10.52");
    const [subgroupSize, setSubgroupSize] = useState<number>(1); 
    const [targetMean, setTargetMean] = useState<number | ''>(''); 
    const [targetSigma, setTargetSigma] = useState<number | ''>(''); 
    const [lambda, setLambda] = useState<number>(0.1); 
    const [ewmaL, setEwmaL] = useState<number>(2.7);
    const [cusumHParam, setCusumHParam] = useState<number>(5);
    const [cusumKParam, setCusumKParam] = useState<number>(0.5);
    const [usl, setUsl] = useState<number | ''>('');
    const [lsl, setLsl] = useState<number | ''>('');

    const processedData = useMemo(() => {
        const lines = rawData.split('\n').filter(l => l.trim() !== '');
        const allValues = lines.map(parseLine).flat();
        const isGrouped = chartType === 'xbar-r' || (['ewma', 'cusum'].includes(chartType) && subgroupSize > 1);

        if (isGrouped) {
            const size = chartType === 'xbar-r' ? Math.max(2, subgroupSize) : subgroupSize;
            const groups: DataPoint[] = [];
            for (let i = 0; i < allValues.length; i += size) {
                const chunk = allValues.slice(i, i + size);
                if (chunk.length === size) {
                     groups.push({ id: groups.length + 1, value: calculateMean(chunk), range: Math.max(...chunk) - Math.min(...chunk), subgroup: [...chunk], sampleSize: size });
                }
            }
            return groups;
        } 
        return allValues.map((val, i) => ({ id: i + 1, value: val, originalValue: val }));
    }, [rawData, chartType, subgroupSize]);

    const chartStats = useMemo(() => {
        if (processedData.length === 0) return { ucl: 0, lcl: 0, cl: 0, sigma: 0, mean: 0, mainChart: null };
        const usePhase2 = phase === 'phase2' && targetMean !== '' && targetSigma !== '';
        const values = processedData.map(d => d.value);
        let ucl: any = 0, lcl: any = 0, cl = 0, sigma = 0, secondChart = null;

        if (chartType === 'imr') {
            const mean = usePhase2 ? Number(targetMean) : calculateMean(values);
            const mrs = [];
            for(let i=1; i<values.length; i++) mrs.push(Math.abs(values[i] - values[i-1]));
            const meanMR = calculateMean(mrs);
            sigma = usePhase2 ? Number(targetSigma) : meanMR / 1.128; 
            cl = mean; ucl = mean + 3 * sigma; lcl = mean - 3 * sigma;
            secondChart = { data: mrs.map((mr, i) => ({ x: i+2, y: mr })), ucl: 3.267 * meanMR, lcl: 0, cl: meanMR, title: "Moving Range (MR)", yLabel: "Range" };
        } else if (chartType === 'xbar-r') {
            const ranges = processedData.map(d => d.range || 0);
            const meanVal = usePhase2 ? Number(targetMean) : calculateMean(values);
            const meanRange = calculateMean(ranges);
            const n = processedData[0]?.sampleSize || 2;
            const constants = STAT_CONSTANTS[n] || STAT_CONSTANTS[2];
            sigma = meanRange / constants.d2;
            cl = meanVal; ucl = meanVal + constants.A2 * meanRange; lcl = meanVal - constants.A2 * meanRange;
            secondChart = { data: ranges.map((r, i) => ({ x: i+1, y: r })), ucl: constants.D4 * meanRange, lcl: constants.D3 * meanRange, cl: meanRange, title: "Range (R)", yLabel: "Range" };
        } else if (chartType === 'ewma') {
            const mean = usePhase2 ? Number(targetMean) : calculateMean(values);
            sigma = usePhase2 ? Number(targetSigma) : calculateStdDev(values);
            const L = ewmaL;
            const ewmaData: any[] = [];
            const uclTime: number[] = [];
            const lclTime: number[] = [];
            let z = mean;
            values.forEach((x, i) => {
                z = lambda * x + (1 - lambda) * z;
                ewmaData.push({ x: i+1, y: z });
                const term = Math.sqrt((lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * (i + 1))));
                uclTime.push(mean + L * sigma * term);
                lclTime.push(mean - L * sigma * term);
            });
            cl = mean; ucl = uclTime; lcl = lclTime;
            return { mainChart: { data: ewmaData, ucl, lcl, cl, title: `EWMA (λ=${lambda}, L=${L})`, yLabel: "EWMA" }, sigma, mean };
        } else if (chartType === 'cusum') {
             const mean = usePhase2 ? Number(targetMean) : calculateMean(values);
             sigma = usePhase2 ? Number(targetSigma) : calculateStdDev(values);
             const K = cusumKParam * sigma;
             const H = cusumHParam * sigma;
             let cp = 0, cm = 0;
             const cpData: any[] = [], cmData: any[] = [];
             values.forEach((x, i) => {
                 cp = Math.max(0, x - (mean + K) + cp);
                 cm = Math.max(0, (mean - K) - x + cm);
                 cpData.push({ x: i+1, y: cp });
                 cmData.push({ x: i+1, y: cm });
             });
             const obs = values.map((v, i) => ({ x: i+1, y: v }));
             return { 
                 mainChart: { data: cpData, ucl: H, lcl: 0, cl: 0, title: "Üst CUSUM (C+) Status Chart", yLabel: "C+", plotType: 'bar', barColor: '#3b82f6', secondarySeries: [{ data: obs, color: '#000', label: 'Gözlemler' }], secondaryMeta: { target: mean } },
                 secondChart: { data: cmData, ucl: H, lcl: 0, cl: 0, title: "Alt CUSUM (C-) Status Chart", yLabel: "C-", plotType: 'bar', barColor: '#f97316', secondarySeries: [{ data: obs, color: '#000', label: 'Gözlemler' }], secondaryMeta: { target: mean } },
                 sigma, mean
             };
        }

        return { mainChart: { data: processedData.map(d => ({ x: d.id, y: d.value })), ucl, lcl, cl, title: chartType.toUpperCase(), yLabel: "Değer" }, secondChart, sigma, mean: cl };
    }, [processedData, chartType, phase, targetMean, targetSigma, subgroupSize, lambda, ewmaL, cusumHParam, cusumKParam]);

    return (
        <div className={`min-h-screen font-serif ${darkMode ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
            <nav className={`sticky top-0 z-50 backdrop-blur-xl border-b px-6 py-4 flex items-center justify-between ${darkMode ? 'bg-gray-900/80 border-gray-800' : 'bg-white/80 border-gray-200'}`}>
                <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">SPC MASTER v2</div>
                <div className="flex bg-gray-500/10 p-1 rounded-full border border-gray-500/20">
                    <button onClick={() => setActiveTab('datasheet')} className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'datasheet' ? 'bg-purple-600 text-white' : ''}`}>Veri</button>
                    <button onClick={() => setActiveTab('chart')} className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'chart' ? 'bg-purple-600 text-white' : ''}`}>Grafik</button>
                </div>
                <button onClick={() => setDarkMode(!darkMode)} className="p-2 bg-gray-500/10 rounded-full">{darkMode ? '☀️' : '🌙'}</button>
            </nav>

            <div className="p-8 max-w-[1600px] mx-auto">
                {activeTab === 'datasheet' ? (
                    <DataGridWorkspace rawData={rawData} setRawData={setRawData} darkMode={darkMode} chartType={chartType} subgroupSize={subgroupSize} />
                ) : (
                    <div className="grid grid-cols-12 gap-8">
                        <div className="col-span-12 lg:col-span-3 space-y-6">
                            <Card darkMode={darkMode} className="p-6">
                                <h3 className="text-lg font-bold mb-4">Ayarlar</h3>
                                <div className="space-y-4">
                                    <select value={chartType} onChange={e => setChartType(e.target.value as any)} className="w-full p-3 rounded-xl bg-gray-500/10 border-none outline-none">
                                        <option value="imr">I-MR</option>
                                        <option value="xbar-r">Xbar-R</option>
                                        <option value="ewma">EWMA</option>
                                        <option value="cusum">CUSUM</option>
                                    </select>
                                    <select value={phase} onChange={e => setPhase(e.target.value as any)} className="w-full p-3 rounded-xl bg-gray-500/10 border-none outline-none">
                                        <option value="phase1">Faz 1 (Gözlemsel)</option>
                                        <option value="phase2">Faz 2 (Standart Belirle)</option>
                                    </select>
                                    {['xbar-r', 'ewma', 'cusum'].includes(chartType) && (
                                        <div>
                                            <label className="text-xs font-bold block mb-1">ALT GRUP BOYUTU (n)</label>
                                            <input type="number" value={subgroupSize} onChange={e => setSubgroupSize(parseInt(e.target.value))} className="w-full p-3 rounded-xl bg-gray-500/10" />
                                        </div>
                                    )}
                                    {chartType === 'ewma' && (
                                        <>
                                            <div><label className="text-xs font-bold block">LAMBDA (λ)</label><input type="number" step="0.05" value={lambda} onChange={e => setLambda(parseFloat(e.target.value))} className="w-full p-3 rounded-xl bg-gray-500/10" /></div>
                                            <div><label className="text-xs font-bold block">L ÇARPANI</label><input type="number" step="0.1" value={ewmaL} onChange={e => setEwmaL(parseFloat(e.target.value))} className="w-full p-3 rounded-xl bg-gray-500/10" /></div>
                                        </>
                                    )}
                                    {chartType === 'cusum' && (
                                        <>
                                            <div><label className="text-xs font-bold block">h (Decision Interval)</label><input type="number" step="1" value={cusumHParam} onChange={e => setCusumHParam(parseFloat(e.target.value))} className="w-full p-3 rounded-xl bg-gray-500/10" /></div>
                                            <div><label className="text-xs font-bold block">k (Slack Parameter)</label><input type="number" step="0.1" value={cusumKParam} onChange={e => setCusumKParam(parseFloat(e.target.value))} className="w-full p-3 rounded-xl bg-gray-500/10" /></div>
                                        </>
                                    )}
                                    <div className="pt-4 border-t border-gray-500/20 space-y-2">
                                        <label className="text-xs font-bold">SPESİFİKASYONLAR</label>
                                        <input type="number" placeholder="USL" value={usl} onChange={e => setUsl(e.target.value === '' ? '' : parseFloat(e.target.value))} className="w-full p-3 rounded-xl bg-gray-500/10" />
                                        <input type="number" placeholder="LSL" value={lsl} onChange={e => setLsl(e.target.value === '' ? '' : parseFloat(e.target.value))} className="w-full p-3 rounded-xl bg-gray-500/10" />
                                    </div>
                                </div>
                            </Card>
                        </div>
                        <div className="col-span-12 lg:col-span-9 space-y-8">
                            {chartStats.mainChart && (
                                <SPCChart 
                                    {...chartStats.mainChart}
                                    specLimits={{ usl: usl !== '' ? usl : undefined, lsl: lsl !== '' ? lsl : undefined }}
                                    darkMode={darkMode}
                                />
                            )}
                            {chartStats.secondChart && (
                                <SPCChart 
                                    {...chartStats.secondChart}
                                    darkMode={darkMode}
                                />
                            )}
                            <StatisticsDashboard stats={chartStats} specLimits={{ usl, lsl }} darkMode={darkMode} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);