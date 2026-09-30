(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TutorlyStudyControls = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const pad = value => String(value).padStart(2, '0');
  const dateString = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  function monthDays(year, month) {
    const offset = (new Date(year, month, 1, 12).getDay() + 6) % 7;
    return Array.from({length: Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7}, (_, index) => index < offset || index - offset >= new Date(year, month + 1, 0).getDate() ? null : dateString(new Date(year, month, index - offset + 1, 12)));
  }
  function scoreAtPoint(x, y) { return Math.round(((Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * 100); }
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  function calendar({value, min, max, onChange}) {
    const root = el('section', 'study-calendar'); root.setAttribute('aria-label', 'Choose your exam date');
    let selected = value, visible = new Date(`${value || min}T12:00:00`);
    function render(focusDate) {
      root.replaceChildren();
      const year = visible.getFullYear(), month = visible.getMonth();
      const head = el('div', 'study-calendar-head'), title = el('h3', '', visible.toLocaleDateString(undefined, {month:'long',year:'numeric'}));
      title.setAttribute('aria-live','polite');
      [-1,1].forEach((delta,index) => {
        const button = el('button','study-button study-button-quiet', delta < 0 ? 'Previous' : 'Next'); button.type='button'; button.setAttribute('aria-label',delta < 0 ? 'Previous month' : 'Next month');
        const edge = dateString(new Date(year, month + (delta < 0 ? 0 : 1), delta < 0 ? 0 : 1, 12)); button.disabled = delta < 0 ? edge < min : edge > max;
        button.addEventListener('click',()=>{visible=new Date(year,month+delta,1,12);render();}); if (!index) head.append(button,title); else head.append(button);
      }); root.append(head);
      const grid=el('div','study-calendar-grid'); ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(day=>grid.append(el('span','study-calendar-weekday',day)));
      let focus;
      monthDays(year,month).forEach(date=>{
        if (!date) {const gap=el('span');gap.setAttribute('aria-hidden','true');grid.append(gap);return;}
        const button=el('button','study-calendar-date',String(Number(date.slice(-2))));button.type='button';button.disabled=date < min || date > max;
        button.setAttribute('aria-label',new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}));
        button.setAttribute('aria-pressed',String(date===selected)); button.dataset.date=date;
        button.addEventListener('click',()=>{selected=date;onChange(date);render(date);});
        button.addEventListener('keydown',event=>{
          const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if (!delta)return;event.preventDefault();
          const next=new Date(`${date}T12:00:00`);next.setDate(next.getDate()+delta);const iso=dateString(next);if (iso<min||iso>max)return;
          visible=next;render(iso);
        }); if (date===focusDate)focus=button;grid.append(button);
      });root.append(grid);if(focus)focus.focus();
    }
    render(); return {element:root,setValue(date){selected=date;visible=new Date(`${date}T12:00:00`);render();}};
  }
  function scoreRing({value, onChange}) {
    const root=el('div','study-score-control'), dial=el('div','study-score-dial');
    const canvas=el('canvas'); canvas.width=640;canvas.height=640;canvas.setAttribute('aria-hidden','true');
    const middle=el('div','study-score-value'), output=el('strong'), caption=el('span'); middle.append(output,caption);
    const handle=el('button','study-score-handle');handle.type='button';handle.setAttribute('role','slider');handle.setAttribute('aria-label','Target score');handle.setAttribute('aria-valuemin','0');handle.setAttribute('aria-valuemax','100');handle.setAttribute('aria-describedby','studyScoreHelp');
    const help=el('p','study-subtitle','Drag around the circle, or use the arrow keys. This is your goal, not a predicted grade.'); help.id='studyScoreHelp';
    dial.append(canvas,middle,handle);root.append(dial,help);
    let score=value===''?80:Number(value), chosen=value!=='', dragging=false;
    function paint() {
      const ctx=canvas.getContext('2d');
      if (ctx) {const styles=getComputedStyle(document.documentElement),color=styles.getPropertyValue('--tutorly-blue').trim()||'#4661f6'; ctx.clearRect(0,0,640,640);ctx.lineWidth=24;ctx.lineCap='round';ctx.beginPath();ctx.strokeStyle=styles.getPropertyValue('--tutorly-border').trim()||'#e2e7f3';ctx.arc(320,320,256,0,Math.PI*2);ctx.stroke();if(score>0){ctx.beginPath();ctx.strokeStyle=color;ctx.arc(320,320,256,-Math.PI/2,-Math.PI/2+Math.PI*2*score/100);ctx.stroke();}}
      const angle=score/100*Math.PI*2-Math.PI/2;handle.style.left=`${50+40*Math.cos(angle)}%`;handle.style.top=`${50+40*Math.sin(angle)}%`;
      handle.setAttribute('aria-valuenow',String(score));handle.setAttribute('aria-valuetext',`${score} percent${chosen?'':' suggested; not yet selected'}`);
      output.textContent=`${score}%`;caption.textContent=chosen?'Target score':'Suggested target';
    }
    function set(next) {score=Math.max(0,Math.min(100,Math.round(next)));chosen=true;onChange(score);paint();}
    function point(event) {const box=dial.getBoundingClientRect(),x=event.clientX-box.left-box.width/2,y=event.clientY-box.top-box.height/2;if(Math.hypot(x,y)<box.width*.22)return;let next=scoreAtPoint(x,y);if(dragging&&score>90&&next<10)next=100;else if(dragging&&score<10&&next>90)next=0;set(next);}
    dial.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();point(event);dragging=true;dial.setPointerCapture(event.pointerId);handle.focus();});
    dial.addEventListener('pointermove',event=>{if(dragging)point(event);});
    ['pointerup','pointercancel','lostpointercapture'].forEach(type=>dial.addEventListener(type,()=>{dragging=false;}));
    handle.addEventListener('keydown',event=>{const delta={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1,PageUp:10,PageDown:-10}[event.key];if(delta!==undefined||['Home','End'].includes(event.key)){event.preventDefault();set(event.key==='Home'?0:event.key==='End'?100:score+delta);}});
    const presets=el('div','study-score-presets');[60,80,90].forEach(amount=>{const button=el('button','study-button',`${amount}%`);button.type='button';button.addEventListener('click',()=>set(amount));presets.append(button);});
    const skip=el('button','study-button study-button-quiet','No target for now');skip.type='button';skip.addEventListener('click',()=>{chosen=false;onChange('');paint();});presets.append(skip);root.append(presets);
    paint();return {element:root,getValue:()=>chosen?score:''};
  }
  return Object.freeze({calendar,scoreRing,monthDays,scoreAtPoint});
});
