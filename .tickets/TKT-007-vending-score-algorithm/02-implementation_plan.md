# Implementation Plan

## Overview
Rewrite `calculateFootTrafficScore` entirely using the new mathematical logic.

## File Changes
- `lib/searchService.js`: Overhauled scoring models and filter loop.

## Database Schema Updates
None

## API Modifications
None

## Step-by-Step Execution Plan
1. Identify base category values.
2. Compute local density matrix based on High-Traffic anchors within 500m.
3. Apply penalty if existing vending nodes are present.
4. Apply log10 scaling bonus for Google ratings.
