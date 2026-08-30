// lib/games/hearsay/questions.ts
import type { Question } from './state'

/**
 * 20 seed questions across five families. Families exist so decoys can be
 * chosen coherently: that grouping is what makes the accused's guess a
 * deduction rather than a coin flip.
 *
 * Grow this with scripts/generate-questions.mjs.
 */
export const QUESTION_BANK: Question[] = [
  { id: 'c1', family: 'conflict', tone: 'mild', template: 'Who is {X} most likely to get into an argument with?' },
  { id: 'c2', family: 'conflict', tone: 'mild', template: 'Who would {X} refuse to share a hotel room with?' },
  { id: 'c3', family: 'conflict', tone: 'mild', template: 'Who does {X} always disagree with about food?' },
  { id: 'c4', family: 'conflict', tone: 'spicy', template: 'Who does {X} secretly find annoying?' },

  { id: 'a1', family: 'affection', tone: 'mild', template: 'Who would {X} go on a road trip with?' },
  { id: 'a2', family: 'affection', tone: 'mild', template: 'Who does {X} miss the most when the group is apart?' },
  { id: 'a3', family: 'affection', tone: 'mild', template: 'Who would {X} want on their team for anything at all?' },
  { id: 'a4', family: 'affection', tone: 'spicy', template: 'Who is {X} closest to and would never admit it?' },

  { id: 'x1', family: 'chaos', tone: 'mild', template: 'Who would {X} get lost in a new city with?' },
  { id: 'x2', family: 'chaos', tone: 'mild', template: 'Who would {X} accidentally get arrested with?' },
  { id: 'x3', family: 'chaos', tone: 'mild', template: 'Who would {X} start a terrible business with?' },
  { id: 'x4', family: 'chaos', tone: 'spicy', template: 'Who would {X} do something they both regret with?' },

  { id: 't1', family: 'trust', tone: 'mild', template: 'Who would {X} call at 3am in an actual emergency?' },
  { id: 't2', family: 'trust', tone: 'mild', template: 'Who would {X} trust with their unlocked phone?' },
  { id: 't3', family: 'trust', tone: 'mild', template: 'Who would {X} lend a large amount of money to?' },
  { id: 't4', family: 'trust', tone: 'mild', template: 'Who would {X} want handling things if they were in trouble?' },

  { id: 's1', family: 'secrets', tone: 'mild', template: 'Who knows the most embarrassing story about {X}?' },
  { id: 's2', family: 'secrets', tone: 'mild', template: 'Who would {X} tell something they told nobody else?' },
  { id: 's3', family: 'secrets', tone: 'mild', template: 'Who would find out first if {X} was lying?' },
  { id: 's4', family: 'secrets', tone: 'mild', template: 'Who does {X} tell things to before anyone else?' },
  { id: 's5', family: 'secrets', tone: 'spicy', template: 'Who has {X} definitely talked about behind their back?' },
  { id: 's6', family: 'secrets', tone: 'spicy', template: 'Who would be least surprised by {X} at their worst?' },
  // Generated with scripts/generate-questions.mjs and hand vetted. Anything that
  // restated an existing question was dropped: two questions with the same
  // meaning make an impossible decoy pair, because the tally cannot separate them.
  { id: 'cf200', family: 'conflict', tone: 'mild', template: 'If {X} started a petty feud, who would it be with?' },
  { id: 'cf201', family: 'conflict', tone: 'mild', template: 'Which person can annoy {X} in under ten seconds?' },
  { id: 'cf202', family: 'conflict', tone: 'mild', template: 'Who is most likely to steal the last slice from {X}?' },
  { id: 'cf203', family: 'conflict', tone: 'mild', template: 'Which person does {X} secretly compete with?' },
  { id: 'cf204', family: 'conflict', tone: 'mild', template: '{X} and who else always pick different sides in an argument?' },

  { id: 'af200', family: 'affection', tone: 'mild', template: 'Who does {X} light up around the most?' },
  { id: 'af201', family: 'affection', tone: 'mild', template: 'Who would {X} choose to sit next to on a long flight?' },
  { id: 'af202', family: 'affection', tone: 'mild', template: '{X} gets a puppy. Who does it love more?' },
  { id: 'af203', family: 'affection', tone: 'mild', template: 'Who does {X} always end up talking to at parties?' },
  { id: 'af204', family: 'affection', tone: 'mild', template: 'Who gives {X} the best hugs in this room?' },

  { id: 'ch200', family: 'chaos', tone: 'mild', template: 'Who would {X} follow into a terrible plan without asking questions?' },
  { id: 'ch201', family: 'chaos', tone: 'mild', template: 'If {X} started a fire, who would be the one who lit it?' },
  { id: 'ch202', family: 'chaos', tone: 'mild', template: "Who is {X}'s partner in crime for bad ideas?" },
  { id: 'ch203', family: 'chaos', tone: 'mild', template: "If {X}'s life were a disaster movie, who plays the villain?" },
  { id: 'ch204', family: 'chaos', tone: 'mild', template: 'Who would {X} blame first when the plan falls apart?' },

  { id: 'tr200', family: 'trust', tone: 'mild', template: 'If {X} said trust me, who would actually believe it?' },
  { id: 'tr201', family: 'trust', tone: 'mild', template: 'Whose secret is safest with {X}?' },
  { id: 'tr202', family: 'trust', tone: 'mild', template: 'If the plan fell apart, who would {X} save first?' },
  { id: 'tr203', family: 'trust', tone: 'mild', template: 'If {X} vanished for a week, who would notice first?' },

  { id: 'se200', family: 'secrets', tone: 'mild', template: '{X} is bursting with a secret. Who cracks it out of them?' },
  { id: 'se201', family: 'secrets', tone: 'mild', template: "If there's a secret in the group, who tells {X} last?" },
  { id: 'se202', family: 'secrets', tone: 'mild', template: 'Who would {X} never trust with a secret?' },
  { id: 'se203', family: 'secrets', tone: 'mild', template: 'Whose secret is {X} most likely still keeping right now?' },

  // Delhi and Gurgaon flavoured, generated with scripts/generate-questions.mjs
  // and filtered for near duplicates. Two questions that mean the same thing
  // make an unsolvable decoy pair, so overlap is rejected automatically.

  // gurgaon
  { id: 'cf-gurgaon-s0', family: 'conflict', tone: 'spicy', template: 'Who does {X} always mute during standup calls?' },
  { id: 'cf-gurgaon-s1', family: 'conflict', tone: 'spicy', template: 'Which coworker would {X} never share a cab with again?' },
  { id: 'cf-gurgaon-s2', family: 'conflict', tone: 'spicy', template: '{X} got into a Slack fight with who last appraisal season?' },
  { id: 'cf-gurgaon-s3', family: 'conflict', tone: 'spicy', template: 'Who does {X} secretly blame for the flooded Sector 29 night out?' },
  { id: 'cf-gurgaon-s4', family: 'conflict', tone: 'spicy', template: 'At brunch, whose laptop bag did {X} complain about?' },
  { id: 'cf-gurgaon-s5', family: 'conflict', tone: 'spicy', template: 'Whose LinkedIn post made {X} roll their eyes hardest?' },
  { id: 'af-gurgaon-s0', family: 'affection', tone: 'spicy', template: 'In the Gurgaon flood, who would {X} rescue first?' },
  { id: 'af-gurgaon-s1', family: 'affection', tone: 'spicy', template: 'Whose LinkedIn post does {X} like within a minute?' },
  { id: 'af-gurgaon-s2', family: 'affection', tone: 'spicy', template: 'On silent standup calls, who is {X} secretly texting?' },
  { id: 'af-gurgaon-s3', family: 'affection', tone: 'spicy', template: 'At Cyber Hub, who does {X} always sit beside?' },
  { id: 'af-gurgaon-s4', family: 'affection', tone: 'spicy', template: 'Whose appraisal does {X} stress about more than their own?' },
  { id: 'af-gurgaon-s5', family: 'affection', tone: 'spicy', template: 'Who would {X} share a cab with, reimbursement or not?' },
  { id: 'ch-gurgaon-s0', family: 'chaos', tone: 'spicy', template: 'Who would {X} get stranded with during Gurgaon flooding?' },
  { id: 'ch-gurgaon-s2', family: 'chaos', tone: 'spicy', template: 'Whose cab reimbursement claim would {X} secretly report?' },
  { id: 'ch-gurgaon-s3', family: 'chaos', tone: 'spicy', template: 'During standup with cameras off, who does {X} mute forever?' },
  { id: 'ch-gurgaon-s4', family: 'chaos', tone: 'spicy', template: 'Cyber Hub night gets messy, who is dragging {X} home?' },
  { id: 'ch-gurgaon-s5', family: 'chaos', tone: 'spicy', template: 'Appraisal season villain who is definitely throwing {X} under the bus?' },
  { id: 'se-gurgaon-s0', family: 'secrets', tone: 'spicy', template: 'Who would {X} tell first if they got a better offer?' },
  { id: 'se-gurgaon-s1', family: 'secrets', tone: 'spicy', template: 'If {X}\'s camera stayed off on standup, who is covering for them?' },
  { id: 'se-gurgaon-s3', family: 'secrets', tone: 'spicy', template: 'At Cyber Hub after hours, who does {X} actually gossip with?' },
  { id: 'se-gurgaon-s4', family: 'secrets', tone: 'spicy', template: 'Whose appraisal drama does {X} already know before HR does?' },
  { id: 'se-gurgaon-s5', family: 'secrets', tone: 'spicy', template: 'If {X} got stuck in the Gurgaon flooding, who would they call, not their manager?' },

  // delhi
  { id: 'cf-delhi-s0', family: 'conflict', tone: 'spicy', template: 'Who does {X} always fight with over Sarojini prices?' },
  { id: 'cf-delhi-s1', family: 'conflict', tone: 'spicy', template: 'At Connaught Place, who ditches {X} mid-shopping?' },
  { id: 'cf-delhi-s2', family: 'conflict', tone: 'spicy', template: 'On the Blue Line metro, who annoys {X} the most?' },
  { id: 'cf-delhi-s3', family: 'conflict', tone: 'spicy', template: 'Whose farmhouse party plan does {X} always ruin?' },
  { id: 'cf-delhi-s4', family: 'conflict', tone: 'spicy', template: 'During wedding season, who competes with {X} for attention?' },
  { id: 'cf-delhi-s5', family: 'conflict', tone: 'spicy', template: 'Who blasts the AC while {X} fights for the purifier?' },
  { id: 'af-delhi-s0', family: 'affection', tone: 'spicy', template: 'Who would {X} call first during a Delhi power cut?' },
  { id: 'af-delhi-s1', family: 'affection', tone: 'spicy', template: 'On the Blue Line, {X} always saves a seat for who?' },
  { id: 'af-delhi-s2', family: 'affection', tone: 'spicy', template: 'During boring wedding functions, {X} texts who nonstop?' },
  { id: 'af-delhi-s3', family: 'affection', tone: 'spicy', template: 'At Sarojini, who does {X} trust to bargain for them?' },
  { id: 'af-delhi-s4', family: 'affection', tone: 'spicy', template: 'Who gets the last kebab if {X} is buying?' },
  { id: 'af-delhi-s5', family: 'affection', tone: 'spicy', template: 'Whose farmhouse party would {X} never skip?' },
  { id: 'ch-delhi-s0', family: 'chaos', tone: 'spicy', template: 'Who would get {X} lost inside Sarojini and just leave?' },
  { id: 'ch-delhi-s2', family: 'chaos', tone: 'spicy', template: 'Which friend convinced {X} the Blue Line metro was a shortcut?' },
  { id: 'ch-delhi-s4', family: 'chaos', tone: 'spicy', template: 'Who dragged {X} to Old Delhi at midnight for one paratha?' },
  { id: 'tr-delhi-s1', family: 'trust', tone: 'spicy', template: 'Who would actually haggle for you at Sarojini instead of getting scammed, {X}?' },
  { id: 'tr-delhi-s5', family: 'trust', tone: 'spicy', template: 'Wedding season chaos, whose lehenga emergency would {X} actually fix on time?' },
  { id: 'se-delhi-s0', family: 'secrets', tone: 'spicy', template: 'Who would {X} tell first if they saw an auntie\'s secret at a wedding?' },
  { id: 'se-delhi-s1', family: 'secrets', tone: 'spicy', template: 'If {X} got dumped, who finds out before the Blue Line ride ends?' },
  { id: 'se-delhi-s2', family: 'secrets', tone: 'spicy', template: 'Whose Sarojini bargaining gossip does {X} always repeat to everyone?' },
  { id: 'se-delhi-s3', family: 'secrets', tone: 'spicy', template: 'At a farmhouse party, who does {X} run to with fresh tea?' },
  { id: 'se-delhi-s4', family: 'secrets', tone: 'spicy', template: 'Who does {X} secretly text during boring DTC bus rides?' },
  { id: 'se-delhi-s5', family: 'secrets', tone: 'spicy', template: 'If a Karol Bagh secret leaks, who does {X} blame first?' },

  // bangalore
  { id: 'cf-bangalore-s0', family: 'conflict', tone: 'spicy', template: 'Who gets into the most arguments with {X} about Bangalore?' },
  { id: 'cf-bangalore-s1', family: 'conflict', tone: 'spicy', template: '{X} brags about Bangalore weather nonstop. Who is done listening?' },
  { id: 'cf-bangalore-s2', family: 'conflict', tone: 'spicy', template: 'If {X} starts on Silk Board traffic, who walks away first?' },
  { id: 'cf-bangalore-s3', family: 'conflict', tone: 'spicy', template: 'Who rolls their eyes every time {X} mentions their startup?' },
  { id: 'cf-bangalore-s4', family: 'conflict', tone: 'spicy', template: '{X} calls their PG in HSR Layout luxury. Who disagrees loudest?' },
  { id: 'cf-bangalore-s5', family: 'conflict', tone: 'spicy', template: 'Who low key hopes {X} gets stuck in Koramangala traffic forever?' },
  { id: 'af-bangalore-s0', family: 'affection', tone: 'spicy', template: 'Who would {X} still visit in Bangalore, potholes and all?' },
  { id: 'af-bangalore-s1', family: 'affection', tone: 'spicy', template: 'Stuck at Silk Board for three hours, who does {X} call first?' },
  { id: 'af-bangalore-s2', family: 'affection', tone: 'spicy', template: 'Who is the one Bangalore transplant {X} actually misses?' },
  { id: 'af-bangalore-s3', family: 'affection', tone: 'spicy', template: 'Whose startup founder rants does {X} secretly enjoy?' },
  { id: 'af-bangalore-s4', family: 'affection', tone: 'spicy', template: 'Who would {X} let crash on their HSR Layout couch anytime?' },
  { id: 'af-bangalore-s5', family: 'affection', tone: 'spicy', template: 'If {X} needed a PG in Koramangala, who would help without complaining?' },
  { id: 'tr-bangalore-s0', family: 'trust', tone: 'spicy', template: 'If {X} moved to Bangalore, who would you trust to stop them?' },
  { id: 'tr-bangalore-s2', family: 'trust', tone: 'spicy', template: '{X} needs a place in Koramangala tomorrow. Who actually finds it?' },
  { id: 'tr-bangalore-s3', family: 'trust', tone: 'spicy', template: 'Whose startup pitch would {X} actually invest in?' },
  { id: 'tr-bangalore-s4', family: 'trust', tone: 'spicy', template: 'If {X} got stuck in HSR Layout traffic, who do they call first?' },
  { id: 'tr-bangalore-s5', family: 'trust', tone: 'spicy', template: 'Who would {X} trust to shut down a Bangalore weather brag?' },
  { id: 'se-bangalore-s0', family: 'secrets', tone: 'spicy', template: 'Who would {X} tell first if they secretly moved to Bangalore?' },
  { id: 'se-bangalore-s1', family: 'secrets', tone: 'spicy', template: '{X} needs a secret vent buddy about Silk Board traffic. Who do they call?' },
  { id: 'se-bangalore-s2', family: 'secrets', tone: 'spicy', template: 'Who does {X} secretly think sounds smug about Bangalore weather?' },
  { id: 'se-bangalore-s3', family: 'secrets', tone: 'spicy', template: 'If {X} started a startup in Koramangala, who would find out fastest?' },
  { id: 'se-bangalore-s4', family: 'secrets', tone: 'spicy', template: 'Who is {X} secretly judging for a three hour HSR commute story?' },
  { id: 'se-bangalore-s5', family: 'secrets', tone: 'spicy', template: '{X} has a PG horror story. Who already knows it?' },

  // chaos
  { id: 'cf-chaos-s0', family: 'conflict', tone: 'spicy', template: 'Who does {X} always fight with over splitting the Zomato bill?' },
  { id: 'cf-chaos-s1', family: 'conflict', tone: 'spicy', template: '{X} cancels plans last minute. Who gets angriest about it?' },
  { id: 'cf-chaos-s2', family: 'conflict', tone: 'spicy', template: 'Who does {X} secretly blame for every cancelled Ola ride?' },
  { id: 'cf-chaos-s3', family: 'conflict', tone: 'spicy', template: 'In the group trip that never happens, who does {X} argue with about dates?' },
  { id: 'cf-chaos-s4', family: 'conflict', tone: 'spicy', template: 'Who gets most annoyed when {X} shows up late for chai?' },
  { id: 'cf-chaos-s5', family: 'conflict', tone: 'spicy', template: '{X} never replies in the WhatsApp group. Who calls them out for it?' },
  { id: 'af-chaos-s0', family: 'affection', tone: 'spicy', template: 'At 2am, whose Blinkit order does {X} secretly want to raid?' },
  { id: 'af-chaos-s1', family: 'affection', tone: 'spicy', template: 'Who does {X} always forgive after cancelling plans last minute?' },
  { id: 'af-chaos-s2', family: 'affection', tone: 'spicy', template: 'On the group trip that never happens, {X} would only go if who agreed first?' },
  { id: 'af-chaos-s3', family: 'affection', tone: 'spicy', template: 'Whose chai break does {X} never skip, no matter what?' },
  { id: 'af-chaos-s4', family: 'affection', tone: 'spicy', template: 'If {X} got stranded with a cancelled Ola, who would actually come get them?' },
  { id: 'af-chaos-s5', family: 'affection', tone: 'spicy', template: 'In the silent WhatsApp group, whose message does {X} always reply to?' },
  { id: 'ch-chaos-s0', family: 'chaos', tone: 'spicy', template: 'Who is most likely to order Blinkit at 2am and blame {X}?' },
  { id: 'ch-chaos-s1', family: 'chaos', tone: 'spicy', template: '{X} always books the Ola and it always gets cancelled, who cancels theirs too?' },
  { id: 'ch-chaos-s2', family: 'chaos', tone: 'spicy', template: 'The bill comes and {X} vanishes to the bathroom, who else does this?' },
  { id: 'ch-chaos-s3', family: 'chaos', tone: 'spicy', template: 'Who keeps planning the group trip that {X} always cancels last minute?' },
  { id: 'ch-chaos-s4', family: 'chaos', tone: 'spicy', template: '{X} is always late, who is somehow always later?' },
  { id: 'ch-chaos-s5', family: 'chaos', tone: 'spicy', template: 'In the WhatsApp group, who ignores {X} the most?' },
  { id: 'tr-chaos-s0', family: 'trust', tone: 'spicy', template: 'If {X} orders Blinkit at 2am, who actually splits it with them?' },
  { id: 'tr-chaos-s1', family: 'trust', tone: 'spicy', template: 'Whose Ola cancellation would {X} still forgive instantly?' },
  { id: 'tr-chaos-s2', family: 'trust', tone: 'spicy', template: 'Who would {X} trust to pay the bill and not vanish?' },
  { id: 'tr-chaos-s3', family: 'trust', tone: 'spicy', template: 'If the group trip actually happens, who convinced {X} to book it?' },
  { id: 'tr-chaos-s4', family: 'trust', tone: 'spicy', template: 'Who does {X} call first when the momos order gets messed up?' },
  { id: 'tr-chaos-s5', family: 'trust', tone: 'spicy', template: 'Whose chai break excuse does {X} always believe without question?' },
  { id: 'se-chaos-s0', family: 'secrets', tone: 'spicy', template: 'If {X} found out a group secret, who hears it first?' },
  { id: 'se-chaos-s1', family: 'secrets', tone: 'spicy', template: '{X} orders Blinkit at 2am and never tells who?' },
  { id: 'se-chaos-s2', family: 'secrets', tone: 'spicy', template: 'Who does {X} secretly tell every time someone cancels Ola?' },
  { id: 'se-chaos-s3', family: 'secrets', tone: 'spicy', template: 'At chai breaks, {X} always gossips about who?' },
  { id: 'se-chaos-s4', family: 'secrets', tone: 'spicy', template: '{X} would leak the momo money scandal to whom?' },
  { id: 'se-chaos-s5', family: 'secrets', tone: 'spicy', template: 'In the silent WhatsApp group, {X} still DMs who?' },

  // Written for this specific group: Gurgaon regulars, the Goa trip, the
  // Splitwise wars, the YC event, and the fact that nobody liked Bangalore.
  { id: 'g01', family: 'conflict', tone: 'spicy', template: 'Who does {X} argue with over three rupees on Splitwise?' },
  { id: 'g02', family: 'conflict', tone: 'spicy', template: 'Who would {X} refuse to share a BnB with ever again?' },
  { id: 'g03', family: 'conflict', tone: 'spicy', template: 'Whose LinkedIn posts does {X} judge the hardest?' },
  { id: 'g04', family: 'conflict', tone: 'spicy', template: 'Who does {X} quietly think is the selfish one?' },
  { id: 'g05', family: 'conflict', tone: 'spicy', template: 'Who keeps {X} awake just by being awake?' },
  { id: 'g06', family: 'conflict', tone: 'spicy', template: 'Who would {X} happily leave behind at Sagar Ratna?' },
  { id: 'g07', family: 'conflict', tone: 'spicy', template: 'Who does {X} think could not do their job to save their life?' },
  { id: 'g08', family: 'conflict', tone: 'mild', template: 'Who fights with {X} over the bill at Social every time?' },
  { id: 'g09', family: 'affection', tone: 'mild', template: 'Who would {X} share the last plate of Zaika biryani with?' },
  { id: 'g10', family: 'affection', tone: 'mild', template: 'Whose house would {X} rather spend every single weekend at?' },
  { id: 'g11', family: 'affection', tone: 'mild', template: 'Who would {X} actually pick up from the airport at 4am?' },
  { id: 'g12', family: 'affection', tone: 'spicy', template: 'Who does {X} secretly enjoy being roasted by?' },
  { id: 'g13', family: 'affection', tone: 'mild', template: 'Who does {X} tell good news to first?' },
  { id: 'g14', family: 'affection', tone: 'spicy', template: 'Who would {X} move cities for, and never admit it?' },
  { id: 'g15', family: 'chaos', tone: 'spicy', template: 'Who gets {X} to that fifth beer every single time?' },
  { id: 'g16', family: 'chaos', tone: 'spicy', template: 'In Goa, who is still at the BnB while {X} is at the beach?' },
  { id: 'g17', family: 'chaos', tone: 'spicy', template: 'Who would {X} follow into a plan that obviously will not work?' },
  { id: 'g18', family: 'chaos', tone: 'spicy', template: 'Who disappears mid night out and leaves {X} looking for them?' },
  { id: 'g19', family: 'chaos', tone: 'mild', template: 'Who would {X} blame when the plan collapses an hour before?' },
  { id: 'g20', family: 'chaos', tone: 'spicy', template: 'Who is most likely to make {X} miss a flight?' },
  { id: 'g21', family: 'chaos', tone: 'spicy', template: 'Who turns into a completely different person after four drinks with {X}?' },
  { id: 'g22', family: 'trust', tone: 'mild', template: 'Who would {X} trust to drive everyone home from Social?' },
  { id: 'g23', family: 'trust', tone: 'mild', template: 'Who does {X} ask for a coupon code before buying anything?' },
  { id: 'g24', family: 'trust', tone: 'mild', template: 'Who would {X} let book the entire trip, no questions asked?' },
  { id: 'g25', family: 'trust', tone: 'spicy', template: 'Who is still sober enough to drive when {X} definitely is not?' },
  { id: 'g26', family: 'trust', tone: 'spicy', template: 'Who would {X} trust to settle the Splitwise honestly?' },
  { id: 'g27', family: 'trust', tone: 'mild', template: 'Who actually shows up when {X} needs help at 2am?' },
  { id: 'g28', family: 'secrets', tone: 'spicy', template: 'Who has heard far too much about {X} and their situationship?' },
  { id: 'g29', family: 'secrets', tone: 'spicy', template: 'Who would {X} tell about a new match before telling anyone else?' },
  { id: 'g30', family: 'secrets', tone: 'spicy', template: 'Who finds out {X} news last, every single time?' },
  { id: 'g31', family: 'secrets', tone: 'spicy', template: 'Who does {X} vent to about this exact group?' },
  { id: 'g32', family: 'secrets', tone: 'spicy', template: 'Who would screenshot {X} and send it straight to the group?' },
  { id: 'g33', family: 'conflict', tone: 'spicy', template: 'Who would {X} least want to be stuck at Silk Board with?' },
  { id: 'g34', family: 'conflict', tone: 'spicy', template: 'Who is most likely to defend Bangalore in front of {X}?' },
  { id: 'g35', family: 'chaos', tone: 'spicy', template: 'Who complained the loudest next to {X} at that YC event?' },
  { id: 'g36', family: 'affection', tone: 'spicy', template: 'Who has been to more places than {X} even knows about?' },
  { id: 'g37', family: 'chaos', tone: 'spicy', template: 'Who would {X} never plan a trip with again?' },
  { id: 'g38', family: 'secrets', tone: 'spicy', template: 'Whose WhatsApp typing can {X} genuinely not decode?' },
  { id: 'g39', family: 'chaos', tone: 'spicy', template: 'Who shows up an hour late to everything {X} plans?' },
  { id: 'g40', family: 'trust', tone: 'spicy', template: 'Who would {X} send in to argue with a landlord?' },
  { id: 'g41', family: 'secrets', tone: 'spicy', template: 'Who would {X} start a smaller group chat without?' },
  { id: 'g42', family: 'affection', tone: 'mild', template: 'Who would {X} want in the passenger seat on a long drive?' },
]

// Mild counts per family: conflict 3, affection 3, chaos 3, trust 4, secrets 4.
// Every family needs at least 3 mild entries, otherwise a mild room cannot be
// served two same-family decoys and pickQuestion silently falls back to
// another family. Keep that invariant when growing the bank.

export function renderQuestion(question: Question, accusedName: string): string {
  return question.template.replaceAll('{X}', accusedName)
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Below this many voters the tally is too thin to separate similar questions. */
const THIN_EVIDENCE_VOTERS = 4

export type PickArgs = {
  tone: 'mild' | 'spicy'
  voterCount: number
  usedQuestionIds: readonly string[]
}

export type Picked = { question: Question; options: Question[] }

export function pickQuestion({ tone, voterCount, usedQuestionIds }: PickArgs): Picked {
  // A mild room never sees spicy questions. A spicy room sees everything.
  const allowed = QUESTION_BANK.filter((q) => (tone === 'mild' ? q.tone === 'mild' : true))

  const unused = allowed.filter((q) => !usedQuestionIds.includes(q.id))
  const pool = unused.length > 0 ? unused : allowed

  const question = pickOne(pool)

  const sameFamily = allowed.filter((q) => q.family === question.family && q.id !== question.id)
  const otherFamilies = allowed.filter((q) => q.family !== question.family)

  // Thin evidence: decoys from other families, so the vote pattern actually
  // separates them. Rich evidence: same-family decoys, which is much harder.
  const preferred = voterCount < THIN_EVIDENCE_VOTERS ? otherFamilies : sameFamily
  const fallback = voterCount < THIN_EVIDENCE_VOTERS ? sameFamily : otherFamilies

  const decoys = [...shuffled(preferred), ...shuffled(fallback)].slice(0, 2)

  return { question, options: shuffled([question, ...decoys]) }
}
