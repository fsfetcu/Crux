import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDndMonitor } from "@dnd-kit/core";
import { dayKey, inWeek } from "./model";

type Point = { x:number; y:number };
type Bounds = { left:number; right:number; top:number; bottom:number };
export function calendarEdgeDirection(bounds:Bounds,point:Point|null,left:number,max:number):number {
  if(!point||max<=1||point.y<bounds.top||point.y>bounds.bottom||point.x<bounds.left||point.x>bounds.right)return 0;
  const edge=Math.min(54,(bounds.right-bounds.left)*.2);
  if(point.x<bounds.left+edge&&left>1)return -1;
  if(point.x>bounds.right-edge&&left<max-1)return 1;
  return 0;
}
const initialDay=(start:string)=>inWeek(dayKey(),start)?dayKey():start;
const cards=(el:HTMLElement)=>Array.from(el.querySelectorAll<HTMLElement>("[data-calendar-date]"));
const cardLeft=(card:HTMLElement,first:HTMLElement)=>card.offsetLeft-first.offsetLeft;

export function useWeekCalendar(start:string) {
  const scrollRef=useRef<HTMLDivElement>(null);
  const [selectedDay,setSelectedDay]=useState(()=>initialDay(start));
  const selectedRef=useRef(selectedDay);
  const [dragging,setDragging]=useState(false);
  const draggingRef=useRef(false);
  const pointer=useRef<Point|null>(null);
  const keyboard=useRef(false);
  const tabHover=useRef<{date:string;at:number}|null>(null);
  const [edge,setEdge]=useState(0);
  const [available,setAvailable]=useState({left:false,right:false});
  const setSelected=useCallback((date:string)=>{if(selectedRef.current!==date){selectedRef.current=date;setSelectedDay(date);}},[]);
  const readScroll=useCallback(()=>{
    const el=scrollRef.current;if(!el||!el.clientWidth)return;
    const items=cards(el),first=items[0];if(!first)return;
    const left=el.scrollLeft>1,right=el.scrollLeft<el.scrollWidth-el.clientWidth-1;
    setAvailable((previous)=>previous.left===left&&previous.right===right?previous:{left,right});
    // Keep the date strip aligned with the nearest day during native swipes.
    if(el.scrollWidth>el.clientWidth+1){
      const closest=items.reduce((best,card)=>Math.abs(cardLeft(card,first)-el.scrollLeft)<Math.abs(cardLeft(best,first)-el.scrollLeft)?card:best,first);
      if(closest.dataset.calendarDate)setSelected(closest.dataset.calendarDate);
    }
  },[setSelected]);
  const selectDay=useCallback((date:string,smooth=true)=>{
    setSelected(date);
    const el=scrollRef.current;if(!el)return;
    const items=cards(el),target=items.find((card)=>card.dataset.calendarDate===date);
    if(!target||!items[0])return;
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo?.({left:Math.max(0,Math.min(el.scrollWidth-el.clientWidth,cardLeft(target,items[0]))),behavior:smooth&&!reduced?"smooth":"instant"});
  },[setSelected]);
  useLayoutEffect(()=>{selectDay(initialDay(start),false);},[start,selectDay]);
  useEffect(()=>{
    const el=scrollRef.current;if(!el)return;
    const resize=()=>{selectDay(selectedRef.current,false);readScroll();};
    resize();
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null;
    observer?.observe(el);window.addEventListener("resize",resize);
    return()=>{observer?.disconnect();window.removeEventListener("resize",resize);};
  },[readScroll,selectDay]);
  useEffect(()=>{
    const move=(event:MouseEvent|PointerEvent|TouchEvent)=>{
      if(keyboard.current)return;
      const point="touches" in event?event.touches[0]:event;
      if(point)pointer.current={x:point.clientX,y:point.clientY};
    };
    window.addEventListener("pointermove",move,{passive:true});
    window.addEventListener("mousemove",move,{passive:true});
    window.addEventListener("touchmove",move,{passive:true});
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("mousemove",move);window.removeEventListener("touchmove",move);};
  },[]);
  const stop=()=>{draggingRef.current=false;setDragging(false);setEdge(0);tabHover.current=null;};
  useDndMonitor({
    onDragStart:({activatorEvent})=>{
      keyboard.current=activatorEvent instanceof KeyboardEvent;
      const event=activatorEvent as MouseEvent|TouchEvent;
      const point="touches" in event?event.touches[0]:event;
      if(keyboard.current)pointer.current=null;
      else if(!pointer.current&&point&&"clientX" in point)pointer.current={x:point.clientX,y:point.clientY};
      draggingRef.current=true;setDragging(true);
    },
    onDragOver:({over})=>{
      const date=over?.data.current?.date;
      if(typeof date==="string"&&(keyboard.current||String(over?.id).startsWith("date-tab:"))){
        // Moving the source rail during a keyboard drag changes dnd-kit’s
        // scroll-adjusted coordinates. Highlight its date tab, then reveal the
        // destination after the drop so the announced day stays authoritative.
        if(keyboard.current)setSelected(date);
        else tabHover.current={date,at:Date.now()};
      }else tabHover.current=null;
    },
    onDragEnd:({over})=>{stop();const date=over?.data.current?.date;if(typeof date==="string")selectDay(date);},
    onDragCancel:stop,
  });
  useEffect(()=>{
    if(!dragging)return;
    let direction=0,since=0,next=0;
    const timer=setInterval(()=>{
      const el=scrollRef.current;if(!el||!draggingRef.current)return;
      if(document.visibilityState!=="visible"){direction=0;setEdge(0);return;}
      const now=Date.now();
      if(tabHover.current&&now-tabHover.current.at>=400){selectDay(tabHover.current.date);tabHover.current=null;next=now+800;}
      const value=keyboard.current?0:calendarEdgeDirection(el.getBoundingClientRect(),pointer.current,el.scrollLeft,el.scrollWidth-el.clientWidth);
      if(value!==direction){direction=value;since=now;setEdge(value);}
      if(!direction||now-since<450||now<next)return;
      const items=cards(el),first=items[0];if(!first)return;
      const positions=items.map((card)=>cardLeft(card,first));
      const closest=positions.reduce((best,left,index)=>Math.abs(left-el.scrollLeft)<Math.abs(positions[best]-el.scrollLeft)?index:best,0);
      const index=Math.max(0,Math.min(items.length-1,closest+direction));
      selectDay(items[index].dataset.calendarDate!);
      next=now+850;
    },50);
    return()=>clearInterval(timer);
  },[dragging,selectDay]);
  return {scrollRef,selectedDay,selectDay,readScroll,dragging,edge,available};
}
