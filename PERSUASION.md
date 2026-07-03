# The Ledger of Unfinished Work

*The business case for the system described in [CONVERGENCE.md](CONVERGENCE.md), written
in plain language for engineers, operations managers, and anyone who signs off on either.
No prior belief required.*

## Your business already runs on a queue. It just isn't written down.

Walk any operation that touches the physical world — a factory floor, a clinic, a print
shop, a shipping dock. The official software tracks the plan: order in, steps completed,
order out. Everything that deviates from the plan lives somewhere else. The failed print
lives in a text message to the night supervisor. The missing part lives in an email
thread. The prescription that arrived by fax with an illegible date of birth lives in a
folder on someone's desk. The order that stalled three weeks ago lives nowhere at all,
until the customer calls.

This second system — call it the shadow queue — has no owner, no measurements, and no
guarantees. Ask it "where is order 4312?" and the answer is a meeting. Ask it "what is
everything we owe customers right now, and how late is it?" and the answer is that
nobody knows, and finding out would take days, and the answer would be wrong by the
time you had it.

Here is the uncomfortable arithmetic: in physical work, deviation from plan is not the
exception — it is a steady, structural fraction of everything you do. Prints fail.
Parts arrive damaged. People are out sick. Machines jam. And every one of those
deviations is handled by your most expensive resource: a skilled person, improvising,
off the books. The plan is cheap to run. The shadow queue is where the money goes.

## The seen and the unseen

A nineteenth-century economist named Frédéric Bastiat made a career out of one
observation: every decision has effects you see and effects you don't, and the unseen
ones usually dominate. Software budgets are a perfect specimen. The money goes to the
seen — the happy path, the features, the dashboard for the plan. The unseen is
everything the software silently hands to humans the moment reality misbehaves:

- **Expediting** — the daily scramble to find and unstick stalled work.
- **Heroics** — the supervisor who keeps the real state of the floor in their head, and
  whose vacation is an operational risk.
- **Silent loss** — the order that fell between two systems and was simply never
  finished. You paid to acquire that customer. You will pay again to lose them.
- **The reconciliation tax** — every report that requires pulling data from three
  systems and a spreadsheet, because the record of the work is separate from the work.

None of these appear as line items. All of them are paid. The proposal below is not a
new capability so much as a transfer: move the shadow queue onto the books, where it can
be seen, priced, and managed like everything else you already manage.

## The proposal, in one sentence

**Give every piece of unfinished work the standing of an accounting entry: it is opened
the moment the promise is made, it is visible the whole time it waits, it must be taken
before it can be worked, and it cannot close without recording how it ended.**

That sentence unpacks into four rules, and the four rules are the entire mechanism:

1. **One board.** All work that is waiting on the real world — a person, a machine, a
   supplier, a customer — waits in one visible place, not in inboxes and memory.
2. **Work is taken, not assigned.** People and machines pull the next item they are
   able and free to do. Taking an item is a lease with a time limit: if the taker goes
   dark, the item returns to the board on its own.
3. **Every item carries a deadline, and every deadline has a consequence.** Not a
   reminder — a consequence. When the clock runs out, the process moves: retry, reroute,
   hand to someone more senior, or fail visibly and on time.
4. **Every item ends exactly one of four ways** — done, timed out, cancelled, or passed
   on — and the ending is written on the item itself. There is no fifth ending. There
   is no "we're not sure what happened to that one."

Everything else in this repository is engineering to make those four rules hold under
load, across crashes, for months at a time. But the rules are the product.

## Double-entry bookkeeping, for work

Before double-entry bookkeeping, a merchant's financial position was a matter of
opinion. After it, every transaction had two sides, the books had to balance, and a
missing dollar announced itself as an imbalance. The innovation wasn't a report — it was
a constraint. Loss became *visible by construction*.

This system is that constraint, applied to work instead of money. Every promise your
operation makes — an order accepted, a prescription received — opens entries in the
ledger. Every entry must close, one of four ways, with the outcome recorded. At any
moment, the set of open entries *is* your work in progress: countable, ageable, sortable
by lateness, priceable. And the same constraint that makes the books balance makes loss
impossible in the strict sense: you cannot lose an order for the same reason you cannot
lose a dollar in balanced books. **Its absence would show.**

Notice what this does to measurement. Every entry is opened with its intent (what was
supposed to happen) and closed with its outcome (what actually happened), with
timestamps on both. So the questions that today require a business-intelligence project
become arithmetic over the ledger:

| The question | Today | With the ledger |
|---|---|---|
| What is waiting right now, and how long has it waited? | A meeting | A count |
| Which orders are at risk of missing their date? | A feeling | A sort |
| How often does step X fail, and what does the rework cost? | Unknown | Two numbers |
| What did machine 7 do in its lifetime? | Maintenance logs, maybe | Its complete record |
| Where is order 4312? | An investigation | A lookup |

No second system to reconcile, because the record *is* the work. The measurement is a
byproduct, not a project.

## Pull is how markets clear

There are two ways to match work to workers. The first is central planning: a scheduler
— human or software — assigns tasks to people and machines. Every operations manager
knows how that goes: the schedule is wrong within the hour, because the planner cannot
know who is actually free, which machine actually jammed, which job actually ran long.
The plan degrades, and humans route around it.

The second way is a market. Work advertises itself: what it needs, how urgent it is.
Workers and machines advertise themselves: what they can do, when they're free. Matching
happens at the moment of truth, by the party who actually knows — the worker who knows
they're free, the machine that knows it's loaded. Priority stops being a standing
meeting and becomes a posted policy — rush orders first, key accounts next, oldest after
that — which management can change in an afternoon without redesigning anything.

Toyota proved this on the factory floor seventy years ago; they called it pull, and it
outperformed every push system it met, for the same reason markets outperform planners:
**the information needed for the decision lives at the edge, not the center.**

The step this system takes — and the part that sounds strange until you watch it run —
is that machines join the same market as people. In the demonstration built here, a
fleet of 3-D printers runs exactly this way. A free printer posts its availability to
the same board a person posts to. An order posts its demand. A matching policy pairs
them. When a printer needs material, it asks on the board — and a technician (human or
automated) answers the same way a reviewer answers a document review. One mechanism,
one board, one set of verbs, for every participant. The order neither knows nor cares
whether the thing that fulfilled it had hands.

## Silence is an answer

The most dangerous question in operations is not "what happened?" It is **"what happens
if nobody does anything?"** In a shadow queue, the answer is: nothing, indefinitely,
until a customer complains or an audit stumbles over the corpse.

Here, the answer is written into every item at birth. Each one carries its deadline, and
the deadline is not a notification — it is a scheduled event that *will* fire and *will*
move the process: retry the automated way, reroute to another team, raise the stakes to
someone senior, or close the item as expired, visibly, on the record. An item that
nobody ever touches still ends — on time, with its ending recorded.

This inverts the usual reliability question. Most systems are reliable when people are
diligent. This one is reliable *especially* when they are not: neglect doesn't leak, it
just takes the pre-agreed path. Nothing in the building depends on someone remembering.

## Rework is a smaller order, not a crisis

When inspection rejects two units of a five-unit order, most software faces an ugly
choice: build a second, special "rework" process (which will drift out of sync with the
first), or let humans handle it off the books (see: shadow queue). Both are expensive;
the second is also invisible.

Here, the two rejected units simply re-enter the same queue as a new, smaller order —
ranked by the same priorities, matched by the same policy, worked by whoever pulls
them. Each pass shrinks what remains; a cap on attempts keeps the loop honest. The
perfect order and the troubled order run the *same* process — the perfect one just
finishes in one pass. You maintain one process, and its bad day is a smaller version of
its good day.

## The honest objections

**"We already have a ticketing system."** Tickets describe work; they are not connected
to it. When a ticket closes, a human must remember to go restart whatever was waiting on
it — and remembering is exactly what fails. Here, closing the item *is* what resumes the
process. The connection isn't a discipline to enforce; it's the mechanism itself.
Forgetting is not discouraged — it is impossible.

**"Our people won't adopt another tool."** They already work a queue; it is currently
made of email, and it is the worst queue money can buy — unordered, unowned, undeadlined.
The verbs do not change: look at what's waiting, take something, finish it. What changes
is that taking and finishing now *count* — the work moves, the record writes itself, and
nobody hunts them down later to ask what happened.

**"What about work nobody takes?"** That is this system at its best, not its worst.
Untaken work ages in plain sight, gets sorted to the top, and eventually escalates or
expires on schedule — an outcome, on the record, on time. Compare with the untaken
email.

**"This sounds like heavyweight process."** The mechanism is one moving part: a visible
item with a deadline and four possible endings. Everything else in this document is a
*consequence* of that part, not additional machinery. Most process frameworks add rules
that people must follow. This adds one constraint that the system enforces — and then
removes the rules the constraint makes unnecessary: the status meetings, the chase-up
emails, the reconciliation spreadsheets, the tribal knowledge.

**"What's the catch?"** The catch is design honesty. The system forces you to answer,
up front, questions the shadow queue lets you defer: How long should this wait before it
escalates? Who is allowed to handle it? What happens on the third failure? Answering
those is real work. But you were always going to answer them — the only choice was
whether to answer them in a design review or at 2 a.m., per incident, forever.

## The claim, plainly

You cannot manage what your systems cannot see, and you cannot lose what your ledger
will not let vanish.

Every promise your business makes becomes a visible entry that must end — one of four
ways, on a deadline, on the record. People and machines pull from the same board under
the same rules. Measurement is a byproduct. Neglect has a schedule. Rework is a smaller
order. The happy path costs nothing extra, and the bad day — which is the day your
operation is actually priced on — is the case the design was built for.

That is the whole pitch. The engineering-grade version — the primitives, the laws, the
running proof with a printer fleet you can start with one command — is next door in
[CONVERGENCE.md](CONVERGENCE.md). And the proof that this works on a live operation —
migrated so gently the end users never noticed — is in [ACME.md](ACME.md).
