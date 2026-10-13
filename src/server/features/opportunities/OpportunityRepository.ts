import {
  get,
  list,
  putSnapshot,
  listAssignees,
  recordRun,
  latestRun,
  history,
} from "./repositoryQueries";
import { update, getBaseline, storeMeasurement } from "./lifecycleWrites";
import { upsertFinding, reconcileObserved } from "./observationWrites";
export const OpportunityRepository = {
  get,
  list,
  putSnapshot,
  upsertFinding,
  listAssignees,
  update,
  getBaseline,
  storeMeasurement,
  reconcileObserved,
  recordRun,
  latestRun,
  history,
};
