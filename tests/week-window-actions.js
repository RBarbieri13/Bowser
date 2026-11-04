import {fireEvent,screen} from '@testing-library/react';
import {expect} from 'vitest';

const select=(label,value)=>fireEvent.change(screen.getByRole('combobox',{name:label,exact:true}),{target:{value:String(value)}});
export const setStatsThrough=week=>select('Base week',week);
export const setStatsCount=count=>select('Weeks back',count);
export const setDfsWeek=week=>select('DFS week',week);
export const setDfsSlate=key=>select('DFS slate',key);
export const toggleDfs=()=>fireEvent.click(screen.getByRole('checkbox',{name:'DFS',exact:true}));
export function setStatsRange(from,through,{allActuals=false}={}){
 if(allActuals&&screen.getByRole('checkbox',{name:'DFS',exact:true}).checked)toggleDfs();
 setStatsThrough(through);
 setStatsCount(through-from+1);
}
export function expectStats(from,through){
 expect(screen.getByRole('combobox',{name:'Base week',exact:true})).toHaveValue(String(through));
 expect(screen.getByRole('combobox',{name:'Weeks back',exact:true})).toHaveValue(String(through-from+1));
}
export function expectDfsWeek(week){
 expect(screen.getByRole('combobox',{name:'DFS week',exact:true})).toHaveValue(String(week));
}
