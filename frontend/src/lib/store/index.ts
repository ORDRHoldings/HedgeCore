import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import hedgeReducer from "./slices/hedgeSlice";
import pipelineReducer from "./slices/pipelineSlice";
import terminalReducer from "./slices/terminalSlice";
import positionReducer from "./slices/positionSlice";

export const store = configureStore({
  reducer: {
    auth:      authReducer,
    hedge:     hedgeReducer,
    pipeline:  pipelineReducer,
    terminal:  terminalReducer,
    positions: positionReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
