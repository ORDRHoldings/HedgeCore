'use client';
import React, { useState } from 'react';
import { Bot, Send, Sparkles, TrendingUp, Target, AlertTriangle, BarChart3 } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

const QUICK_ACTIONS = [
  { icon: <Sparkles size={11} />, label: 'Chart Summary', prompt: 'Summarize the current chart structure and key levels' },
  { icon: <TrendingUp size={11} />, label: 'Trend Analysis', prompt: 'Analyze the current trend and potential reversals' },
  { icon: <Target size={11} />, label: 'Key Levels', prompt: 'Identify key support and resistance levels' },
  { icon: <AlertTriangle size={11} />, label: 'Risk Assessment', prompt: 'Assess current risk/reward for potential entries' },
  { icon: <BarChart3 size={11} />, label: 'Confluence', prompt: 'Check confluence of indicators and structure' },
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function AIPanel() {
  const { state, symbolInfo } = useWorkspace();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Ready to analyze ${state.symbol}. I can see ${state.indicators.length} active indicators${state.showSR ? ', S/R levels' : ''}${state.showFVG ? ', FVG zones' : ''}. What would you like to know?`,
      timestamp: Date.now(),
    },
  ]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    const aiMsg: Message = {
      role: 'assistant',
      content: `[AI analysis for ${state.symbol} on ${state.timeframe}]\n\nThis is a placeholder for the AI chart analysis engine. In production, this would provide contextual analysis of:\n\n- Current price: ${formatPrice(symbolInfo.price)}\n- Active indicators: ${state.indicators.map(i => i.name).join(', ') || 'None'}\n- Timeframe: ${state.timeframe}\n- Chart structure and SMC patterns`,
      timestamp: Date.now() + 1,
    };
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Context bar */}
      <div style={{
        padding: '6px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Bot size={12} color={T.accent} />
        <span style={{ fontSize: 10, fontWeight: 500, color: T.text2, fontFamily: T.font }}>
          {state.symbol} · {state.timeframe} · {state.indicators.length} indicators
        </span>
      </div>

      {/* Quick actions */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.prompt)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '3px 7px', borderRadius: 3,
                border: `1px solid ${T.border}`, background: T.surfaceAlt,
                color: T.text2, fontSize: 9, fontWeight: 500,
                fontFamily: T.font, cursor: 'pointer', outline: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text2; }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: 8,
            display: 'flex', flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '90%', padding: '6px 10px', borderRadius: 6,
              background: msg.role === 'user' ? T.accentBg : T.surfaceAlt,
              border: `1px solid ${msg.role === 'user' ? 'transparent' : T.border}`,
            }}>
              <div style={{
                fontSize: 10, color: T.text1, fontFamily: T.font,
                lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{
        padding: '6px 8px', borderTop: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(input); }}
          placeholder="Ask about the chart..."
          style={{
            flex: 1, height: 28, padding: '0 8px', borderRadius: 3,
            border: `1px solid ${T.border}`, background: T.surfaceAlt,
            color: T.text1, fontSize: 11, fontFamily: T.font, outline: 'none',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 3, border: 'none',
            background: T.accent, color: '#fff', cursor: 'pointer', outline: 'none',
          }}
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
