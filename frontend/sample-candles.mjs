/**
 * 화면 전용 MOCK_SAMPLE 변환 모델.
 * 가격의 순서 외에 시각·체결·거래량 정보가 전혀 없으므로 real OHLCV나
 * exchange candles로 사용하지 않는다. 4/8개 샘플의 그룹 요약일 뿐이다.
 */
export const SAMPLE_GROUP_SIZES = Object.freeze([4,8]);

export function sampleCandles(points,groupSize=4){
  if(!Array.isArray(points) || points.length<4 || points.length>1000 ||
     !SAMPLE_GROUP_SIZES.includes(groupSize) || points.length%groupSize!==0 ||
     points.some(p=>typeof p!=='number'||!Number.isFinite(p)||p<=0)){
    throw new RangeError('Invalid MOCK_SAMPLE candle groups');
  }
  return Object.freeze(Array.from({length:points.length/groupSize},(_,i)=>{
    const group=points.slice(i*groupSize,(i+1)*groupSize);
    return Object.freeze({
      firstSample:i*groupSize+1,lastSample:(i+1)*groupSize,
      open:group[0],high:Math.max(...group),low:Math.min(...group),
      close:group.at(-1),
    });
  }));
}

/** SVG path-only layer: no HTML injection and no browser dependencies. */
export function sampleCandlePaths(candles,{low,high,width=800,top=35,bottom=260}={}){
  if(!Array.isArray(candles)||candles.length<1||
     typeof low!=='number'||!Number.isFinite(low)||low<=0||
     typeof high!=='number'||!Number.isFinite(high)||high<low||
     !Number.isFinite(width)||width<=0||!Number.isFinite(top)||!Number.isFinite(bottom)||bottom<=top){
    throw new RangeError('Invalid sample candle bounds');
  }
  const span=high-low||1;
  const y=p=>bottom-(p-low)/span*(bottom-top);
  const groups={upWicks:[],downWicks:[],upBodies:[],downBodies:[]};
  const widthPerBar=width/candles.length;
  for(const [index,bar] of candles.entries()){
    if(!bar||!['open','high','low','close'].every(k=>typeof bar[k]==='number'&&Number.isFinite(bar[k])&&bar[k]>0)||
       bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close)||
       bar.low<low||bar.high>high){
      throw new RangeError('Invalid sample OHLC');
    }
    const x=((index+0.5)*widthPerBar).toFixed(2);
    const bucket=bar.close>=bar.open?'up':'down';
    groups[bucket+'Wicks'].push('M'+x+' '+y(bar.high).toFixed(2)+' L'+x+' '+y(bar.low).toFixed(2));
    // Even a flat grouped sample retains a visible horizontal body.
    const openY=y(bar.open),closeY=y(bar.close);
    groups[bucket+'Bodies'].push('M'+x+' '+openY.toFixed(2)+' L'+x+' '+
      (Math.abs(openY-closeY)<.5?(openY+.5):closeY).toFixed(2));
  }
  return Object.freeze({
    upWicks:groups.upWicks.join(' '),downWicks:groups.downWicks.join(' '),
    upBodies:groups.upBodies.join(' '),downBodies:groups.downBodies.join(' '),
    bodyWidth:Math.max(5,Math.min(28,widthPerBar*.58)),
    lastY:y(candles.at(-1).close),
  });
}
