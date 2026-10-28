import { assertEquals } from 'jsr:@std/assert';
import { parseHistoricalLanePermutations } from './importyeti_historical_lanes.ts';
Deno.test('historical ImportYeti lane counts retain all-time scope and ports', () => {
 const rows = parseHistoricalLanePermutations([{exit_port_country:'Turkey',entry_port_country:'United States of America',exit_port:'Istanbul',entry_port:'Savannah, Ga.',shipments:165,teu:978}]);
 assertEquals(rows[0], {origin_country:'Turkey',destination_country:'United States of America',origin_port:'Istanbul',destination_port:'Savannah, Ga.',shipments:165,teu:978,scope:'historical_all_time'});
});
Deno.test('rejects unknown lane countries and invalid numbers',()=>assertEquals(parseHistoricalLanePermutations([{shipments:1},{exit_port_country:'Turkey',entry_port_country:'US',shipments:-1}]), []));
