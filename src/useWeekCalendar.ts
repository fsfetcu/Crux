import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDndMonitor } from "@dnd-kit/core";
import { dayKey, inWeek } from "./model";

type Point = { x:number; y:number };
type Bounds = { left:number; right:number; top:number; bottom:number };
type ScrollDestination = {date:string;left:number;startedAt:number;lastLeft:number;lastMovedAt:number};
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
  const destination=useRef<ScrollDestination|null>(null);
  const settledAt=useRef(0);
  const setSelected=useCallback((date:string)=>{if(selectedRef.current!==date){selectedRef.current=date;setSelectedDay(date);}},[]);
  const readScroll=useCallback(()=>{
    const el=scrollRef.current;if(!el||!el.clientWidth)return;
    const items=cards(el),first=items[0];if(!first)return;
    const left=el.scrollLeft>1,right=el.scrollLeft<el.scrollWidth-el.clientWidth-1;
    setAvailable((previous)=>previous.left===left&&previous.right===right?previous:{left,right});
    const pending=destination.current,now=Date.now();
    if(pending){
      if(Math.abs(el.scrollLeft-pending.left)<=1){
        destination.current=null;settledAt.current=now;setSelected(pending.date);return;
      }
      if(Math.abs(el.scrollLeft-pending.lastLeft)>.5){pending.lastLeft=el.scrollLeft;pending.lastMovedAt=now;}
      // Keep the chosen date stable while sliding past intermediate cards.
      // Release a cancelled/stalled animation rather than trapping native swipes.
      if(now-pending.startedAt<400||now-pending.lastMovedAt<250)return;
      destination.current=null;settledAt.current=now;
    }
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
    const left=Math.max(0,Math.min(el.scrollWidth-el.clientWidth,cardLeft(target,items[0])));
    if(destination.current?.date===date&&Math.abs(destination.current.left-left)<=1)return;
    if(Math.abs(el.scrollLeft-left)<=1){destination.current=null;return;}
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const animated=smooth&&!reduced,now=Date.now();
    destination.current=animated?{date,left,startedAt:now,lastLeft:el.scrollLeft,lastMovedAt:now}:null;
    el.scrollTo?.({left,behavior:animated?"smooth":"instant"});
  },[setSelected]);
  useLayoutEffect(()=>{selectDay(initialDay(start),false);},[start,selectDay]);
  useEffect(()=>{
    const el=scrollRef.current;if(!el)return;
    let width=-1;
    const resize=()=>{
      // Drop highlights and card contents may change height during a drag.
      // Only a width change needs to realign the horizontal rail.
      if(el.clientWidth===width)return;
      width=el.clientWidth;destination.current=null;
      selectDay(selectedRef.current,false);readScroll();
    };
    const interrupt=()=>{destination.current=null;};
    resize();
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(resize):null;
    observer?.observe(el);window.addEventListener("resize",resize);
    el.addEventListener("pointerdown",interrupt,{passive:true});el.addEventListener("touchstart",interrupt,{passive:true});el.addEventListener("wheel",interrupt,{passive:true});
    return()=>{observer?.disconnect();window.removeEventListener("resize",resize);el.removeEventListener("pointerdown",interrupt);el.removeEventListener("touchstart",interrupt);el.removeEventListener("wheel",interrupt);};
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
      else if(point&&"clientX" in point)pointer.current={x:point.clientX,y:point.clientY};
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
      if(destination.current)readScroll();
      if(tabHover.current&&now-tabHover.current.at>=400&&!destination.current){selectDay(tabHover.current.date);tabHover.current=null;next=now+800;return;}
      const value=keyboard.current?0:calendarEdgeDirection(el.getBoundingClientRect(),pointer.current,el.scrollLeft,el.scrollWidth-el.clientWidth);
      if(value!==direction){direction=value;since=now;setEdge(value);}
      if(!direction||now-since<450||now<next||destination.current||now-settledAt.current<300)return;
      const items=cards(el),first=items[0];if(!first)return;
      const positions=items.map((card)=>cardLeft(card,first));
      const closest=positions.reduce((best,left,index)=>Math.abs(left-el.scrollLeft)<Math.abs(positions[best]-el.scrollLeft)?index:best,0);
      const index=Math.max(0,Math.min(items.length-1,closest+direction));
      selectDay(items[index].dataset.calendarDate!);
      next=now+850;
    },50);
    return()=>clearInterval(timer);
  },[dragging,selectDay,readScroll]);
  return {scrollRef,selectedDay,selectDay,readScroll,dragging,edge,available};
}
