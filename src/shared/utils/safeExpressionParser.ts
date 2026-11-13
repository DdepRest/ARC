import jsep from 'jsep';

export function safeEval(expression: string, context: Record<string, any> = {}): boolean {
  if (!expression || expression.trim() === '') return false;
  
  try {
    const ast = jsep(expression);
    return Boolean(evaluate(ast, context));
  } catch (e) {
    console.error('safeEval parsing error:', e);
    return false;
  }
}

function evaluate(node: any, context: Record<string, any>): any {
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Identifier':
      return context[node.name];
    case 'BinaryExpression':
      const left = evaluate(node.left, context);
      const right = evaluate(node.right, context);
      switch (node.operator) {
        case '==': return left == right;
        case '===': return left === right;
        case '!=': return left != right;
        case '!==': return left !== right;
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        default: throw new Error(`Unsupported binary operator: ${node.operator}`);
      }
    case 'LogicalExpression':
      const l = evaluate(node.left, context);
      switch (node.operator) {
        case '&&': return l && evaluate(node.right, context);
        case '||': return l || evaluate(node.right, context);
        default: throw new Error(`Unsupported logical operator: ${node.operator}`);
      }
    case 'UnaryExpression':
      const arg = evaluate(node.argument, context);
      switch (node.operator) {
        case '!': return !arg;
        case '-': return -arg;
        case '+': return +arg;
        default: throw new Error(`Unsupported unary operator: ${node.operator}`);
      }
    case 'MemberExpression':
      const obj = evaluate(node.object, context);
      if (node.computed) {
        return obj[evaluate(node.property, context)];
      } else {
        return obj[node.property.name];
      }
    default:
      throw new Error(`Unsupported node type: ${node.type}`);
  }
}
