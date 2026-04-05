import React, { useState, useEffect } from 'react'
import type { Settings } from './types'
import { getSettings, saveSettings, initForwardTest } from './lib/db'
import { useForwardTest } from './hooks/useForwardTest'

import HomeTab         from './components/tabs/HomeTab'
import VerifyTab       from './components/tabs/VerifyTab'
import TradeHistoryTab from './components/tabs/TradeHistoryTab'
import StrategyTab     from './components/tabs/StrategyTab'
import ReportTab       from './components/tabs/ReportTab'

const DEFAULT_SETTINGS: Settings = {
  wallet: 5000, riskPercent: 2, maxOpenTrades: 3,
  telegramEnabled: false, timezone: 'Asia/Dubai'
}

const TABS = [
  { id:'home',     label:'🏠 Home + Scan' },
  { id:'history',  label:'📋 History' },
  { id:'strategy', label:'⚡ Strategy' },
  { id:'report',   label:'📊 Report' },
  { id:'verify',   label:'🔬 Verify' },
]

export default function App() {
  const [tab,          setTab]          = useState('home')
  const [settings,     setSettings]     = useState<Settings>(DEFAULT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    getSettings().then(s => { setSettings(s); setLoading(false) })
    initForwardTest()
  }, [])

  const ft = useForwardTest(settings.wallet)

  async function handleSaveSettings() {
    await saveSettings(settings)
    setShowSettings(false)
  }

  if (loading) {
    return (
      <div style={{background:'#05050f',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:'#00ff88',letterSpacing:4}}>SIGNAL SCAN</div>
      </div>
    )
  }

  return (
    <div style={{background:'#05050f',minHeight:'100vh',fontFamily:"'Space Mono',monospace",color:'#ccc',fontSize:12}}>
      {/* Header */}
      <div style={{background:'#08081a',borderBottom:'1px solid #ffffff08',display:'flex',alignItems:'center',flexWrap:'wrap'}}>
        <div style={{padding:'12px 16px',borderRight:'1px solid #ffffff08',flexShrink:0}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'#00ff88',letterSpacing:4,lineHeight:1}}>
            SIGNAL<span style={{color:'#fff'}}> SCAN</span>
          </div>
          <div style={{fontSize:9,color:'#333',letterSpacing:2}}>DAY {ft.dayNumber}/60 · v{ft.liveParams?.version||1}</div>
        </div>

        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'12px 14px',fontFamily:"'Space Mono',monospace",fontSize:10,letterSpacing:1,
            cursor:'pointer',border:'none',
            borderBottom:`2px solid ${tab===t.id?'#00ff88':'transparent'}`,
            background:tab===t.id?'#00ff8806':'transparent',
            color:tab===t.id?'#00ff88':'#444',
            transition:'all 0.2s',flexShrink:0
          }}>{t.label}</button>
        ))}

        <div style={{marginLeft:'auto',padding:'0 12px',display:'flex',alignItems:'center',gap:8}}>
          {ft.dayNumber > 0 && (
            <div style={{fontSize:9,fontFamily:'monospace',padding:'4px 10px',borderRadius:6,background:'#00ff8811',border:'1px solid #00ff8833',color:'#00ff88'}}>
              DAY {ft.dayNumber}
            </div>
          )}
          {ft.signalCount > 0 && (
            <div style={{fontSize:9,fontFamily:'monospace',padding:'4px 10px',borderRadius:6,background:'#00aaff11',border:'1px solid #00aaff33',color:'#00aaff'}}>
              {ft.signalCount} logged
            </div>
          )}
          {ft.totalPnl !== 0 && (
            <div style={{fontSize:9,fontFamily:'monospace',padding:'4px 10px',borderRadius:6,background:ft.totalPnl>=0?'#00ff8811':'#ff335511',border:`1px solid ${ft.totalPnl>=0?'#00ff8833':'#ff335533'}`,color:ft.totalPnl>=0?'#00ff88':'#ff3355'}}>
              {ft.winRate}% WR · {ft.totalPnl>=0?'+':''}${Math.abs(ft.totalPnl).toFixed(0)}
            </div>
          )}
          <button onClick={()=>setShowSettings(!showSettings)} style={{fontSize:10,fontFamily:'monospace',padding:'6px 12px',borderRadius:6,cursor:'pointer',background:showSettings?'#ffffff11':'transparent',border:'1px solid #ffffff08',color:'#555'}}>
            ⚙
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{background:'#0a0a1a',border:'1px solid #ffffff08',borderRadius:'0 0 12px 12px',padding:16,margin:'0 16px'}}>
          <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color:'#444',marginBottom:12}}>SETTINGS</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            {[{key:'wallet',label:'Wallet ($)',type:'number'},{key:'riskPercent',label:'Risk %',type:'number'},{key:'maxOpenTrades',label:'Max open',type:'number'}].map(({key,label,type})=>(
              <div key={key}>
                <div style={{fontSize:10,fontFamily:'monospace',color:'#555',marginBottom:4}}>{label}</div>
                <input type={type} value={(settings as Record<string,unknown>)[key] as string}
                  onChange={e=>setSettings(s=>({...s,[key]:parseFloat(e.target.value)||0}))}
                  style={{width:'100%',padding:'6px 10px',background:'#1a1a2e',border:'1px solid #333',borderRadius:6,color:'#fff',fontFamily:'monospace',fontSize:12}}/>
              </div>
            ))}
            <div style={{display:'flex',alignItems:'flex-end'}}>
              <button onClick={handleSaveSettings} style={{width:'100%',padding:8,fontFamily:'monospace',fontSize:11,fontWeight:700,cursor:'pointer',borderRadius:6,background:'#00ff8822',border:'1px solid #00ff88',color:'#00ff88'}}>SAVE</button>
            </div>
          </div>
          <div style={{marginTop:6,fontSize:9,fontFamily:'monospace',color:'#333'}}>
            ${settings.wallet} wallet · {settings.riskPercent}% risk = ${(settings.wallet*settings.riskPercent/100).toFixed(0)} max/trade
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{maxHeight:'calc(100vh - 53px)',overflowY:'auto'}}>
        {tab==='home' && (
          <HomeTab
            dayNumber={ft.dayNumber} totalPnl={ft.totalPnl} winRate={ft.winRate}
            wins={ft.wins.length} closedCount={ft.closed.length} pf={ft.pf}
            avgWin={ft.avgWin} avgLoss={ft.avgLoss} equityCurve={ft.equityCurve}
            strategyVersion={ft.liveParams?.version||1} strategyChanges={ft.liveParams?.changes||[]}
            openCount={ft.open.length} capital={settings.wallet} signalCount={ft.signalCount}
            trades={ft.trades}
          />
        )}
        {tab==='history'  && <TradeHistoryTab/>}
        {tab==='strategy' && <StrategyTab liveParams={ft.liveParams} trades={ft.trades} coinProfiles={ft.coinProfiles}/>}
        {tab==='verify'  && <VerifyTab/>}
        {tab==='report'   && <ReportTab dayNumber={ft.dayNumber} trades={ft.trades} ghostTrades={ft.ghostTrades} liveParams={ft.liveParams} totalPnl={ft.totalPnl} winRate={ft.winRate} pf={ft.pf} capital={settings.wallet}/>}
      </div>
    </div>
  )
}
