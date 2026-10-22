import { expect,it,vi } from "vitest";
import { calendarKeyboard,plannerCollisions } from "../src/PlannerDnD";
function navigate(code:string,phone=true,date="2026-10-22"){
  const dates=Array.from({length:7},(_,i)=>`2026-10-${19+i}`);
  const containers=dates.flatMap((date,i)=>[{id:`date-tab:${date}`,data:{current:{date}},i,tab:true},{id:`day:${date}`,data:{current:{date}},i,tab:false}]);
  const rects=new Map(containers.map((c)=>[c.id,{left:c.tab?30+c.i*42:c.i*300,top:c.tab?400:500,width:c.tab?(phone?40:0):300,height:c.tab?70:200}]));
  const event={code,preventDefault:vi.fn()};
  const result=calendarKeyboard(event as unknown as KeyboardEvent,{context:{droppableContainers:{getEnabled:()=>containers},droppableRects:rects,over:{id:`day:${date}`,data:{current:{date}}},collisionRect:{width:100,height:50}}} as any);
  return {result,event};
}
it("moves from a day card to its neighboring date tab on phones",()=>{
  expect(navigate("ArrowRight").result).toEqual({x:168,y:410}); // Friday tab, not Sunday.
  expect(navigate("ArrowLeft").result).toEqual({x:84,y:410});
});
it("uses visible day cards on desktop and stays within the current week",()=>{
  expect(navigate("ArrowRight",false).result).toEqual({x:1300,y:575});
  expect(navigate("ArrowRight",true,"2026-10-25").result).toEqual({x:252,y:410});
  expect(navigate("ArrowLeft",true,"2026-10-19").result).toEqual({x:0,y:410});
});
it("leaves unrelated keys to their usual handlers",()=>{const {result,event}=navigate("Escape");expect(result).toBeUndefined();expect(event.preventDefault).not.toHaveBeenCalled();});

it("keeps the keyboard-selected date authoritative when ancestor scrolling shifts the collision rectangle",()=>{
  const chosen={id:"date-tab:2026-10-22",data:{current:{date:"2026-10-22"}}},other={id:"day:2026-10-21",data:{current:{date:"2026-10-21"}}};
  const args={pointerCoordinates:null,droppableContainers:[chosen,other],collisionRect:{left:0,top:0,width:100,height:100},droppableRects:new Map([[chosen.id,{left:500,top:500,width:40,height:70}],[other.id,{left:0,top:0,width:100,height:100}]])};
  expect(plannerCollisions(args as any,chosen.id)[0].id).toBe(chosen.id);
});
