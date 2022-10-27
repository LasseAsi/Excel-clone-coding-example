import React, { useState } from 'react';
import './App.css';

/*
Author: Lasse Asikainen

Desc.: A small unpolished attempt at Excel-like spreadsheet in the web-browser.
Interprets mathematical expressions that can reference other cells in the spreadsheet.

TODO:
  -Stop a cell from referencing itself
  -Cell dependencies: if cell is changed, update all cells that reference said cell
  -Vectors and matrices of cells: expand cell references to work with cell areas like
   in Excel.
*/

//Desc.: React-object Used as a single cell in the 'Excel'-like table
//Returns: A single cell in the table with a textfield for input as a React-object
function Cell(props) {

  const [focus, setFocus] = useState(false);

  return (
    <th>
      <input
        value={focus ? props.value.raw : props.value.value}
        onChange={props.onChange}
        onFocus={(e) => {setFocus(true)}}
        onBlur={(e) => {setFocus(false)}}
      />
    </th>
  );
}

//Initialize table dimensions and initial values for cells
const tableWidth = 4;
const tableHeight = 6;
const initialValue = Array.from({length: tableWidth*tableHeight}, (_, i) => {return {raw:'', value:''}});

//Main app
function App() {

  //Cell values are taken stored in the state
  const [cells, setCells] = useState(initialValue);

  //Short-hand for getting the index of a cell by its position
  const getCellIndex = (row, column) => {
    return tableWidth*row+column;
  }

  //Short-hand for getting a cell by its position
  const getCell = (row, column) => {
    return cells[getCellIndex(row, column)];
  }

  //Desc.: Find top level brackets
  //Returns: [Start index of brackets, Terminal index of brackets, Substring inside brackets] 
  //          or null if no valid brackets found
  function brackets(s){
    let i0, i1 = null;
    let counter = 0;
    for(let i = 0; i < s.length; i++){
        if(s[i] === '('){
            if(counter == 0) i0 = i;
            counter++;
        } else if(s[i] === ')') {
            if(counter == 1) i1 = i;
            else if(counter < 1) return null;
            counter--;
        }
    }
    return (i0 != null && i1 != null) ?  [i0, i1, s.substr(i0+1, i1-i0-1)] : null;
  }

  //Desc.: Find and parse first number from starting position to right or left
  //Returns: [Start index of number, Terminal index of number, Number]
  //          or null if no number found
  function parseNumber(s, start=0, left = false){

    let i, i0, i1 = null;
    let numeric, decimal, signed = false;
    let sign = 1;
    
    for(i = start; i < s.length && i >= 0; i+=1-2*left){
        
        //Check the type of the next character: digit, decimal point, sign or other
        let type = 0;
        if(!isNaN(s[i])) type = 1;
        else if(s[i] === '.') type = 2;
        else if (s[i] === '-' || s[i] === '+') type = 3;

        //Parsing from left to right
        if (!left){

            //Start an attempt at parsing a number under the following conditions:
            //1. Next char is a digit
            //2. Next char is a decimal point and have not encountered a decimal point since reset
            //3. Next char is a sign symbol and have not encountered a digit or decimal point since reset
            if ((type == 1) || (type == 2 && !decimal) || (type == 3 && !decimal && !numeric)){

                i1 = i; //Update the terminal index of the attempt
                if(i0 == null) i0 = i; //Start the attempt
                if(type == 1) numeric = true; //Mark as having encountered a digit
                else if(type == 2) decimal = true; //Mark as having encountered a decimal point
                else if(type == 3) {
                    i0 = i+1; //If we encounter a sign symbol, then shift the starting index to the right
                    signed=true; //Mark as having encountered a sign symbol
                    if(s[i] === '-') sign*=-1; //Keep record of the sign of the number
                }
            
            //If next char didn't pass the above check and there is a valid attempt
            //then we can end here
            } else if(i0 != null && numeric){
                break;
            
            //Otherwise reset the attempt
            } else{
                i0 = i1 = null;
                numeric = decimal = signed = false;
                sign = 1;
            }
        
        //Parsing from right to left
        } else{

            //Start an attempt at parsing a number under the following conditions:
            //1. Next char is a digit and have not encountered a sign symbol since reset
            //2. Next char is a decimal point and have not encountered a decimal point or a sign symbol since reset
            //3. Next char is a sign symbol and have encountered a digit since reset
            if ((type == 1 && !signed) || (type == 2 && !decimal && !signed) || (type == 3 && numeric)){

                if(i1 == null) i1=i; //Start the attempt
                if(type == 1) numeric=true; //Mark as having encountered a digit
                else if(type == 2) decimal=true; //Mark as having encountered a decimal point
                if(type == 3){ 
                    signed=true; //Mark as having encountered a sign symbol
                    if(s[i] === '-') sign *= -1; //Keep record of the sign of the number
                } else i0=i; //Update starting index only if not a sign symbol

            //If next char didn't pass the above check and there is a valid attempt
            //then we can end here
            } else if(i1 != null && numeric){
                if ((type == 1 || type == 2) && signed){
                  i++; //Don't consume a sign symbol after a digit
                  if(s[i] === '-' )sign*=-1;
                }
                break;
            //Otherwise reset the attempt
            } else{
                i0 = i1 = null;
                numeric = decimal = signed = false;
                sign = 1;
            }
        }
    }

    if (!left){
        return (i1 >= i0 && i0 != null && i1!=null) ? [i0, i-1, sign*parseFloat(s.substr(i0, i1-i0+1))] : null;
    } else{
        return (i1 >= i0 && i0 != null && i1!=null) ? [i+1, i1, sign*parseFloat(s.substr(i0, i1-i0+1))] : null;
    }
    
  }

  //Desc.: Resolve arithmetic operations
  //Returns: modified string with operations resolved to their numeric values
  function resolveOperators(str, operators, callbacks){

    
    let search = null;
    const regex = new RegExp('([0-9]|[0-9][.])['+operators.toString()+']');

    //Find the following pattern in the string (*number* *operator*)
    while((search = str.match(regex)) != null){

        const start = search.index;

        //Parse the first number to the left and to the right of the operator
        const res1 = parseNumber(str, start, true);
        const res2 = parseNumber(str, start + search[0].length);

        if (res1==null || res2==null) return null;

        const num1 = res1[2];
        const num2 = res2[2];

        //Evaluate the result of the operation and substitute it in the original string
        const result = callbacks[operators.findIndex((e) => e == search[0].substr(search[0].length-1))](num1, num2);
        str = str.substr(0,res1[0])+result.toString()+str.substr(res2[1]+1);
    }

    return str;
  }

  //Desc.: Resolve an arithmetic expression
  //Returns: modified string with arithmetic expressions resolved to their numeric values
  function resolveExpr(expr){

    //Check if expression is not a plain number
    if (isNaN(expr)){

        //Etner here if expression is not a number

        //Process recursively all subsexpressions that are inside brackets
        //and replace them with their evaluated numeric values
        let res = null;
        while ((res = brackets(expr)) != null){
            const subexpr = resolveExpr(res[2]);
            if (subexpr == null) return null;
            expr = expr.substr(0, res[0]) + subexpr + expr.substr(res[1] + 1);
        }

        //Handle multiplication and division with same priorities left to right
        expr = resolveOperators(expr, ['*', '/'], [(x,y)=>x*y, (x,y)=>x/y]);

        if (expr == null) return null;

        //Handle plus and minus with same priorities left to right
        expr = resolveOperators(expr, ['+', '-'], [(x,y)=>x+y, (x,y)=>x-y]);

        if (expr == null) return null;

        //Return processed expression
        return expr;

    //If expression is a plain number, then return the number
    } else{
        return expr;
    }
  }

  //Desc.: Resolve the value of a cell
  //Returns: 
  function resolveCell(row, column, cellsNext) {

    //Get raw cell value
    const raw = cellsNext[getCellIndex(row, column)].raw;

    //If cell raw value starts with '=', then it is interpreted as a math expression
    if (raw.startsWith('=')) {

      let value = raw.substr(1);

      //Substitute all occurences of the form '[a-z][0-9]' by the resolved value of the
      //corresponding cell
      value = value.replace(/[a-z][0-9]+/g, (match, contents, offset, input_string) => {
          const tempColumn = match.charCodeAt(0) - 97;
          const tempRow = parseInt(match.substr(1));
          return resolveCell(tempRow, tempColumn, cellsNext);
      });
      cellsNext[getCellIndex(row, column)].value = resolveExpr(value);
    
    //Otherwise the value is equal to the raw value
    } else{
      cellsNext[getCellIndex(row, column)].value = raw;
    }
    return cellsNext[getCellIndex(row, column)].value;
  }

  //Create setter for cells
  const setCell = (row, column, value) => {
    const cellsNext = cells.slice();
    cellsNext[getCellIndex(row, column)].raw = value;
    resolveCell(row, column, cellsNext);
    setCells(cellsNext);
  }

  //Generate the table based on the dimensions defined above
  const rows = Array.apply(0, Array(tableHeight)).map((x, i) => {
    const row = Array.apply(0, Array(tableWidth)).map((x, j) => {
      return (<Cell
        value={getCell(i,j)}
        onChange={e => setCell(i,j, e.target.value)}
      />);
    });
    return (
    <tr>
      {row}
    </tr>);
  });

  //Return a table that contains the rows generated above
  return (
    <table>
      {rows}
    </table>
  );
}

export default App;