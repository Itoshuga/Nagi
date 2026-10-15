import type { Discovery } from "../../src/types/discoveries";
import { tourism } from "./catalogue/tourism";
import { activities } from "./catalogue/activities";
import { food } from "./catalogue/food";
import { addresses } from "./catalogue/addresses";

export const discoveries: readonly Discovery[] = [...tourism, ...activities, ...food, ...addresses];
