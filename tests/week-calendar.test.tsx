// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { act,cleanup,fireEvent,render,screen } from "@testing-library/react";
import type { DndMonitorListener } from "@dnd-kit/core";
import { calendarEdgeDirection,useWeekCalendar } from "../src/useWeekCalendar";
import { addDays } from "../src/model";
let monitor:DndMonitorListener;
vi.mock("@dnd-kit/core",()=>({useDndMonitor:(value:DndMonitorListener)=>{monitor=value;}}));
const start="2026-10-19";
const bounds={left:20,right:320,top:100,bottom:500};
let rail:HTMLDivElement,scroll:ReturnType<typeof vi.fn>;
function Harness({week=start}:{week?:string}){
  const calendar=useWeekCalendar(week);
  return <><p data-testid="selection">{calendar.selectedDay}</p><button onClick={()=>calendar.selectDay(addDays(week,5))}>Saturday</button><div ref={calendar.scrollRef} onScroll={calendar.readScroll} data-testid="rail" data-edge={calendar.edge}>{Array.from({length:7},(_,i)=><div key={i} data-calendar-date={addDays(week,i)}/>)}</div></>;
}
function layout(){
  rail=screen.getByTestId("rail") as HTMLDivElement;
  Object.defineProperties(rail,{clientWidth:{configurable:true,value:300},scrollWidth:{configurable:true,value:2100},scrollLeft:{configurable:true,value:0,writable:true}});
  vi.spyOn(rail,"getBoundingClientRect").mockReturnValue({...bounds,width:300,height:400,x:20,y:100,toJSON:()=>({})});
  [...rail.children].forEach((child,i)=>Object.defineProperty(child,"offsetLeft",{configurable:true,value:i*300}));
  scroll=vi.fn(({left}:{left:number})=>{rail.scrollLeft=left;fireEvent.scroll(rail);});Object.defineProperty(rail,"scrollTo",{configurable:true,value:scroll});
}
function drag(){act(()=>monitor.onDragStart?.({activatorEvent:new MouseEvent("mousedown",{clientX:150,clientY:600})} as any));}
function move(x:number,y=200){fireEvent.mouseMove(window,{clientX:x,clientY:y});}
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("horizontal weekly calendar",()=>{
  it("only advances at visible edges, stays bounded, and has a neutral centre",()=>{
    expect(calendarEdgeDirection(bounds,{x:310,y:200},0,1800)).toBe(1);
    expect(calendarEdgeDirection(bounds,{x:25,y:200},300,1800)).toBe(-1);
    for(const point of [null,{x:150,y:200},{x:330,y:200},{x:310,y:99},{x:25,y:501}])expect(calendarEdgeDirection(bounds,point,300,1800)).toBe(0);
    expect(calendarEdgeDirection(bounds,{x:25,y:200},0,1800)).toBe(0);
    expect(calendarEdgeDirection(bounds,{x:310,y:200},1800,1800)).toBe(0);
    expect(calendarEdgeDirection(bounds,{x:310,y:200},0,0)).toBe(0);
  });
  it("synchronizes native scrolling and date selection without modifying training",()=>{
    render(<Harness/>);layout();
    act(()=>{rail.scrollLeft=600;fireEvent.scroll(rail);});expect(screen.getByTestId("selection").textContent).toBe("2026-10-21");
    fireEvent.click(screen.getByText("Saturday"));expect(scroll).toHaveBeenCalledWith({left:1500,behavior:"smooth"});expect(screen.getByTestId("selection").textContent).toBe("2026-10-24");
  });
  it("keeps the destination selected throughout an animated slide past earlier dates",()=>{
    render(<Harness/>);layout();scroll.mockImplementation(()=>{});
    fireEvent.click(screen.getByText("Saturday"));
    for(const left of [50,300,600,900,1200,1450]){
      act(()=>{rail.scrollLeft=left;fireEvent.scroll(rail);});
      expect(screen.getByTestId("selection").textContent).toBe("2026-10-24");
    }
    act(()=>{rail.scrollLeft=1500;fireEvent.scroll(rail);});
    expect(screen.getByTestId("selection").textContent).toBe("2026-10-24");
    act(()=>{rail.scrollLeft=1200;fireEvent.scroll(rail);});
    expect(screen.getByTestId("selection").textContent).toBe("2026-10-23");
  });
  it("does not realign an animation when the rail height changes",()=>{
    let resize=()=>{};
    vi.stubGlobal("ResizeObserver",class {constructor(callback:()=>void){resize=callback;}observe(){}disconnect(){}});
    render(<Harness/>);layout();act(()=>resize());scroll.mockClear();scroll.mockImplementation(()=>{});
    fireEvent.click(screen.getByText("Saturday"));
    act(()=>{rail.scrollLeft=1000;fireEvent.scroll(rail);resize();resize();});
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("selection").textContent).toBe("2026-10-24");
  });
  it("finishes each edge slide and pauses before advancing again, even with slow animation frames",()=>{
    render(<Harness/>);layout();scroll.mockImplementation(()=>{});drag();move(310);
    act(()=>vi.advanceTimersByTime(550));expect(scroll).toHaveBeenCalledTimes(1);
    for(let left=15;left<300;left+=15){
      act(()=>{rail.scrollLeft=left;fireEvent.scroll(rail);vi.advanceTimersByTime(100);});
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("selection").textContent).toBe("2026-10-20");
    }
    act(()=>{rail.scrollLeft=300;fireEvent.scroll(rail);vi.advanceTimersByTime(250);});
    expect(scroll).toHaveBeenCalledTimes(1);
    act(()=>vi.advanceTimersByTime(100));expect(scroll).toHaveBeenLastCalledWith({left:600,behavior:"smooth"});
  });
  it("lets a manual swipe interrupt an animated selection",()=>{
    render(<Harness/>);layout();scroll.mockImplementation(()=>{});
    fireEvent.click(screen.getByText("Saturday"));fireEvent.touchStart(rail);
    act(()=>{rail.scrollLeft=300;fireEvent.scroll(rail);});
    expect(screen.getByTestId("selection").textContent).toBe("2026-10-20");
  });
  it("waits for an edge hover, advances repeatedly, and stops when leaving or cancelling",()=>{
    render(<Harness/>);layout();drag();move(310);
    act(()=>vi.advanceTimersByTime(400));expect(scroll).not.toHaveBeenCalled();
    act(()=>vi.advanceTimersByTime(150));expect(rail.scrollLeft).toBe(300);
    act(()=>vi.advanceTimersByTime(850));expect(rail.scrollLeft).toBe(600);
    move(150);act(()=>vi.advanceTimersByTime(1500));expect(rail.scrollLeft).toBe(600);
    move(25);act(()=>vi.advanceTimersByTime(550));expect(rail.scrollLeft).toBe(300);
    act(()=>monitor.onDragCancel?.({} as any));act(()=>vi.advanceTimersByTime(2000));expect(rail.scrollLeft).toBe(300);
  });
  it("does not scroll on ordinary hover, outside the calendar, or while hidden",()=>{
    render(<Harness/>);layout();move(310);act(()=>vi.advanceTimersByTime(1000));expect(scroll).not.toHaveBeenCalled();
    drag();move(310,80);act(()=>vi.advanceTimersByTime(1000));expect(scroll).not.toHaveBeenCalled();
    move(310);Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});act(()=>vi.advanceTimersByTime(1000));expect(scroll).not.toHaveBeenCalled();
  });
  it("reveals a date tab after a short hover and retains the actual drop day",()=>{
    render(<Harness/>);layout();drag();move(310,80);
    act(()=>monitor.onDragOver?.({over:{id:"date-tab:2026-10-23",data:{current:{date:"2026-10-23"}}}} as any));
    act(()=>vi.advanceTimersByTime(350));expect(scroll).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(100));expect(rail.scrollLeft).toBe(1200);
    act(()=>monitor.onDragEnd?.({over:{id:"day:2026-10-23",data:{current:{date:"2026-10-23"}}}} as any));expect(screen.getByTestId("selection").textContent).toBe("2026-10-23");
    const count=scroll.mock.calls.length;act(()=>vi.advanceTimersByTime(2000));expect(scroll).toHaveBeenCalledTimes(count);
  });
  it("keeps a keyboard drag source stable until its destination is dropped",()=>{
    render(<Harness/>);layout();act(()=>monitor.onDragStart?.({activatorEvent:new KeyboardEvent("keydown",{code:"Space"})} as any));move(310);
    act(()=>monitor.onDragOver?.({over:{id:"date-tab:2026-10-25",data:{current:{date:"2026-10-25"}}}} as any));expect(rail.scrollLeft).toBe(0);expect(screen.getByTestId("selection").textContent).toBe("2026-10-25");
    act(()=>vi.advanceTimersByTime(2000));expect(scroll).not.toHaveBeenCalled();
    act(()=>monitor.onDragEnd?.({over:{id:"date-tab:2026-10-25",data:{current:{date:"2026-10-25"}}}} as any));expect(rail.scrollLeft).toBe(1800);
  });
  it("selects the new week rather than retaining a day from the previous week",()=>{
    const view=render(<Harness/>);layout();fireEvent.click(screen.getByText("Saturday"));
    view.rerender(<Harness week="2026-11-02"/>);expect(screen.getByTestId("selection").textContent).toBe("2026-11-02");expect(rail.scrollLeft).toBe(0);
  });
});

it("tracks held touch positions and pointer movement without requiring repeated drag events",()=>{
  render(<Harness/>);layout();const touch=new Event("touchstart");Object.defineProperty(touch,"touches",{value:[{clientX:150,clientY:600}]});
  act(()=>monitor.onDragStart?.({activatorEvent:touch} as any));fireEvent.touchMove(window,{touches:[{clientX:310,clientY:200}]});
  act(()=>vi.advanceTimersByTime(550));expect(rail.scrollLeft).toBe(300);
  fireEvent.touchMove(window,{touches:[{clientX:150,clientY:200}]});act(()=>vi.advanceTimersByTime(1000));expect(rail.scrollLeft).toBe(300);
  fireEvent(window,new MouseEvent("pointermove",{clientX:25,clientY:200}));act(()=>vi.advanceTimersByTime(550));expect(rail.scrollLeft).toBe(0);
});
