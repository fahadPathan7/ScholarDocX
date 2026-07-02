with open('frontend/src/components/admin/AdminPortal.tsx', 'r') as f:
    c = f.read()

c = c.replace('import React from "react";', 'import React, { useState, useEffect } from "react";\nimport { createPortal } from "react-dom";')

with open('frontend/src/components/admin/AdminPortal.tsx', 'w') as f:
    f.write(c)
