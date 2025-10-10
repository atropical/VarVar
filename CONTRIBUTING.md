# Contributing to VarVar

Thank you for your interest in contributing to VarVar! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Node.js (v18 or higher)
- npm
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/atropical/varvar.git
   cd varvar
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

This will start the TypeScript compiler in watch mode, build the plugin, and serve the UI with hot reloading.

## Code Style Guidelines

### TypeScript

- Use strict TypeScript with proper type annotations
- Prefer interfaces over types for object shapes
- Use enums for constants and command types
- Add JSDoc comments for all public functions and interfaces
- Use meaningful variable and function names

### React Components

- Use functional components with hooks
- Follow the component structure:
  ```typescript
  interface ComponentProps {
    // Props interface
  }
  
  /**
   * JSDoc comment describing the component
   */
  export const Component: React.FC<ComponentProps> = ({ prop1, prop2 }) => {
    // Component logic
    return (
      // JSX
    );
  };
  ```

### File Organization

- Place reusable UI components in `src/components/`
- Place format-specific views in `src/views/`
- Place utility functions in `src/utils/`
- Use descriptive file names that match their purpose

### Naming Conventions

- **Files**: Use PascalCase for React components, camelCase for utilities
- **Components**: PascalCase (e.g., `ExportHeader`)
- **Functions**: camelCase (e.g., `handleExport`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_FILENAME`)
- **Types/Interfaces**: PascalCase (e.g., `PluginMessage`)

## Component Structure

### UI Components

All UI components should be:
- **Reusable**: Can be used across different views
- **Typed**: Have proper TypeScript interfaces for props
- **Documented**: Include JSDoc comments
- **Focused**: Have a single responsibility

#### Layout Components

- **PluginDialogShell**: Provides consistent layout, padding, and common elements (like Footer) for all views
- **ExportHeader**: Format-specific titles and descriptions
- **Footer**: Plugin information and links (automatically included in shell)

Example structure:
```typescript
import React from "react";
import { ComponentProps } from "figma-kit";

interface MyComponentProps {
    title: string;
    onAction: () => void;
    optional?: boolean;
}

/**
 * Brief description of what this component does
 * @param props - Component properties
 */
export const MyComponent: React.FC<MyComponentProps> = ({ 
    title, 
    onAction, 
    optional = false 
}) => {
    return (
        // Component JSX
    );
};
```

### Export Views

Format-specific views should:
- Use shared components from `src/components/`
- Handle format-specific logic
- Provide appropriate defaults
- Include proper error handling

## Pull Request Process

### Before Submitting

1. **Test your changes**: Ensure the plugin builds and works correctly
   ```bash
   npm run test  # Runs TypeScript check and build
   ```

2. **Follow code style**: Use the established patterns and conventions

3. **Add documentation**: Update JSDoc comments and README if needed

4. **Test in Figma**: Verify your changes work in the actual Figma environment

### PR Guidelines

1. **Clear title**: Use a descriptive title that explains what the PR does
2. **Detailed description**: Explain the changes and why they were made
3. **Link issues**: Reference any related issues
4. **Screenshots**: Include screenshots for UI changes
5. **Testing notes**: Describe how you tested the changes

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested in Figma
- [ ] All exports work correctly
- [ ] No TypeScript errors
- [ ] UI renders properly

## Screenshots (if applicable)
Add screenshots here

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console errors
```

## Testing Expectations

### Manual Testing

Before submitting a PR, test the following:

1. **All export formats**: JSON, CSV, CSS, JavaScript
2. **Menu commands**: Each format-specific menu item
3. **Linked variables**: Ensure proper handling across formats
4. **Error handling**: Test with edge cases and invalid data
5. **UI responsiveness**: Check different screen sizes
6. **File downloads**: Verify files are downloaded correctly

### Automated Testing

- TypeScript compilation must pass without errors
- Build process must complete successfully
- No linting errors

## Type Safety Requirements

### Strict Typing

- All function parameters and return types must be explicitly typed
- Use proper enum types instead of string literals
- Avoid `any` type - use proper interfaces or union types
- Use type guards for runtime type checking

### Message Handling

All plugin messages must use the `PluginMessage` interface:

```typescript
// Good
figma.ui.postMessage({
    type: MessageTypes.EXPORT_SUCCESS,
    format: OutputFormats.JSON,
    data: "exported data"
} as PluginMessage);

// Bad
figma.ui.postMessage({
    type: "EXPORT.SUCCESS",  // String literal
    format: "json",          // String literal
    data: "exported data"
});
```

## Adding New Export Formats

To add a new export format:

1. **Add to enums**: Update `OutputFormats` and `PluginCommands` in `types.d.ts`
2. **Create utility**: Add export function in `src/utils/`
3. **Create view**: Add format-specific view in `src/views/`
4. **Update router**: Add case to the switch statement in `ui.tsx`
5. **Update manifest**: Add menu item in `figma.manifest.ts`
6. **Update documentation**: Add to README and this file

## Reporting Issues

When reporting issues:

1. **Use the issue template**: Provide all requested information
2. **Include steps to reproduce**: Clear, numbered steps
3. **Add screenshots**: Visual context is helpful
4. **Specify environment**: Figma version, OS, browser
5. **Check existing issues**: Avoid duplicates

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Help others learn and grow
- Follow the project's coding standards

## Questions?

If you have questions about contributing:

1. Check existing issues and discussions
2. Review the codebase and documentation
3. Open a new issue with the "question" label
4. Join our community discussions

Thank you for contributing to VarVar! 🎉
